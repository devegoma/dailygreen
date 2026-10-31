import { and, count, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type {
	RequestOptions,
	PushSubscription as WebPushSubscription,
} from "web-push";
import { db } from "~/db/index.server";
import {
	dailyRecord,
	habit,
	notificationSetting,
	pushSubscription,
} from "~/db/schema";
import { toJstDateString, toJstTimeString } from "~/lib/api/date";
import { createPushDeadline, withPushDeadline } from "./push-deadline.server";
import { pushEndpointRejectionReason } from "./push-endpoint";
import { getPushRuntimeConfig } from "./push-runtime.server";
import { getEligiblePushSubscriptions } from "./push-subscriptions.server";
import { sendPushNotification } from "./push-transport.server";

const PUSH_DISPATCH_LOCK_ID = 1_144_750_163;
const PUSH_TTL_SECONDS = 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;
const PUSH_SEND_CONCURRENCY = 4;
const MAX_CANDIDATES_PER_RUN = 100;
const MAX_SUBSCRIPTIONS_PER_RUN = 20;
const MAX_LEGACY_SUBSCRIPTIONS_PER_USER = 10;
// 5s claim + five waves of 10s + cleanup/response margin. Scheduler waits 75s.
const PUSH_JOB_TIMEOUT_MS = 65_000;
const PUSH_CLAIM_TIMEOUT_MS = 5_000;

export type PushDispatchSummary = {
	locked: boolean;
	candidateUsers: number;
	claimedUsers: number;
	skippedNoHabits: number;
	skippedCompleted: number;
	skippedNoSubscriptions: number;
	successfulSubscriptions: number;
	failedSubscriptions: number;
	removedInvalidSubscriptions: number;
	skippedUnsafeSubscriptions: number;
	truncatedLegacySubscriptions: number;
	deferredByBudget: number;
	scannedCandidateUsers: number;
	timedOutSubscriptions: number;
	skippedByDeadline: number;
};

type ClaimedSubscription = {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	expirationTime: Date | null;
	updatedAtCursor: string;
};

type ClaimedUser = {
	incompleteCount: number;
	subscriptions: ClaimedSubscription[];
};

type PushSender = (
	subscription: WebPushSubscription,
	payload: string,
	options: RequestOptions,
	signal: AbortSignal,
) => Promise<unknown>;

function emptySummary(): PushDispatchSummary {
	return {
		locked: true,
		candidateUsers: 0,
		claimedUsers: 0,
		skippedNoHabits: 0,
		skippedCompleted: 0,
		skippedNoSubscriptions: 0,
		successfulSubscriptions: 0,
		failedSubscriptions: 0,
		removedInvalidSubscriptions: 0,
		skippedUnsafeSubscriptions: 0,
		truncatedLegacySubscriptions: 0,
		deferredByBudget: 0,
		scannedCandidateUsers: 0,
		timedOutSubscriptions: 0,
		skippedByDeadline: 0,
	};
}

function isInvalidSubscriptionError(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("statusCode" in error)) {
		return false;
	}
	const statusCode = (error as { statusCode?: unknown }).statusCode;
	return statusCode === 404 || statusCode === 410;
}

async function claimDueUsers(
	now: Date,
	signal: AbortSignal,
): Promise<{
	summary: PushDispatchSummary;
	claimedUsers: ClaimedUser[];
}> {
	const today = toJstDateString(now);
	const currentTime = toJstTimeString(now);

	return db.transaction(async (tx) => {
		signal.throwIfAborted();
		// Bound database work too. An expired callback checks the signal and
		// rolls back; it must never commit claims after its caller gives up.
		await tx.execute(sql`set local statement_timeout = '5s'`);
		await tx.execute(sql`set local lock_timeout = '1s'`);
		const lockRows = await tx.execute(
			sql`select pg_try_advisory_xact_lock(${PUSH_DISPATCH_LOCK_ID}) as "acquired"`,
		);
		const lockResult = lockRows[0] as { acquired?: boolean } | undefined;
		if (!lockResult?.acquired) {
			return {
				summary: { ...emptySummary(), locked: false },
				claimedUsers: [],
			};
		}

		const dueCondition = and(
			eq(notificationSetting.enabled, true),
			lte(notificationSetting.notifyAt, currentTime),
			or(
				isNull(notificationSetting.lastNotifiedDate),
				ne(notificationSetting.lastNotifiedDate, today),
			),
		);
		const [total] = await tx
			.select({ count: count() })
			.from(notificationSetting)
			.where(dueCondition);

		const summary = emptySummary();
		summary.candidateUsers = total?.count ?? 0;
		const claimedUsers: ClaimedUser[] = [];
		if (summary.candidateUsers === 0) {
			return { summary, claimedUsers };
		}

		// Rotate a bounded window each minute so long-lived ineligible users
		// at the start of the index do not starve later subscribers.
		const offset =
			(Math.floor(now.getTime() / 60_000) * MAX_CANDIDATES_PER_RUN) %
			summary.candidateUsers;
		const selectCandidates = (start: number, limit: number) =>
			tx
				.select({ userId: notificationSetting.userId })
				.from(notificationSetting)
				.where(dueCondition)
				.orderBy(notificationSetting.userId)
				.offset(start)
				.limit(limit);
		const candidates = await selectCandidates(offset, MAX_CANDIDATES_PER_RUN);
		if (
			candidates.length < MAX_CANDIDATES_PER_RUN &&
			candidates.length < summary.candidateUsers
		) {
			candidates.push(
				...(await selectCandidates(
					0,
					MAX_CANDIDATES_PER_RUN - candidates.length,
				)),
			);
		}
		summary.scannedCandidateUsers = candidates.length;
		let reservedSubscriptions = 0;

		for (const candidate of candidates) {
			signal.throwIfAborted();
			const activeHabits = await tx
				.select({ id: habit.id })
				.from(habit)
				.where(
					and(eq(habit.userId, candidate.userId), isNull(habit.archivedAt)),
				);
			if (activeHabits.length === 0) {
				summary.skippedNoHabits += 1;
				continue;
			}

			const completed = await tx
				.select({ habitId: dailyRecord.habitId })
				.from(dailyRecord)
				.where(
					and(
						inArray(
							dailyRecord.habitId,
							activeHabits.map((activeHabit) => activeHabit.id),
						),
						eq(dailyRecord.date, today),
					),
				);
			const incompleteCount = activeHabits.length - completed.length;
			if (incompleteCount <= 0) {
				summary.skippedCompleted += 1;
				continue;
			}

			const { subscriptions, rejected } = await getEligiblePushSubscriptions(
				tx,
				candidate.userId,
				MAX_LEGACY_SUBSCRIPTIONS_PER_USER + 1,
				signal,
			);
			for (const [reason, count] of Object.entries(rejected)) {
				summary.skippedUnsafeSubscriptions += count;
				if (count > 0) {
					writeDispatchLog("warn", "unsafe_endpoint_inactive", {
						reason,
						count,
					});
				}
			}
			if (subscriptions.length === 0) {
				summary.skippedNoSubscriptions += 1;
				continue;
			}
			if (
				reservedSubscriptions +
					Math.min(subscriptions.length, MAX_LEGACY_SUBSCRIPTIONS_PER_USER) >
				MAX_SUBSCRIPTIONS_PER_RUN
			) {
				summary.deferredByBudget += 1;
				break;
			}
			if (subscriptions.length > MAX_LEGACY_SUBSCRIPTIONS_PER_USER) {
				summary.truncatedLegacySubscriptions +=
					subscriptions.length - MAX_LEGACY_SUBSCRIPTIONS_PER_USER;
			}

			signal.throwIfAborted();
			const claimed = await tx
				.update(notificationSetting)
				.set({ lastNotifiedDate: today, updatedAt: now })
				.where(
					and(
						eq(notificationSetting.userId, candidate.userId),
						eq(notificationSetting.enabled, true),
						or(
							isNull(notificationSetting.lastNotifiedDate),
							ne(notificationSetting.lastNotifiedDate, today),
						),
					),
				)
				.returning({ userId: notificationSetting.userId });
			if (claimed.length === 0) {
				continue;
			}

			const selected = subscriptions.slice(
				0,
				MAX_LEGACY_SUBSCRIPTIONS_PER_USER,
			);
			claimedUsers.push({ incompleteCount, subscriptions: selected });
			reservedSubscriptions += selected.length;
			summary.claimedUsers += 1;
		}

		signal.throwIfAborted();
		return { summary, claimedUsers };
	});
}

function toWebPushSubscription(
	subscription: ClaimedSubscription,
): WebPushSubscription {
	return {
		endpoint: subscription.endpoint,
		expirationTime: subscription.expirationTime?.getTime() ?? null,
		keys: {
			p256dh: subscription.p256dh,
			auth: subscription.auth,
		},
	};
}

function writeDispatchLog(
	level: "info" | "warn",
	event: string,
	fields: Record<string, unknown>,
): void {
	const message = JSON.stringify({ type: "push_dispatch", event, ...fields });
	if (level === "warn") console.warn(message);
	else console.info(message);
}

export async function dispatchPushNotifications(
	options: { now?: Date; sendPush?: PushSender } = {},
): Promise<PushDispatchSummary> {
	const deadline = createPushDeadline(PUSH_JOB_TIMEOUT_MS);
	try {
		return await withPushDeadline(deadline.signal, () =>
			runDispatch(options, deadline.signal),
		);
	} finally {
		deadline.dispose();
	}
}

async function runDispatch(
	options: { now?: Date; sendPush?: PushSender },
	signal: AbortSignal,
): Promise<PushDispatchSummary> {
	const startedAt = performance.now();
	const now = options.now ?? new Date();
	const config = getPushRuntimeConfig();
	const claimDeadline = createPushDeadline(PUSH_CLAIM_TIMEOUT_MS, signal);
	// Await COMMIT/ROLLBACK instead of abandoning a claim at the cutoff.
	const { summary, claimedUsers } = await claimDueUsers(
		now,
		claimDeadline.signal,
	).finally(claimDeadline.dispose);
	if (!summary.locked) {
		writeDispatchLog("info", "skipped_locked", {
			durationMs: Math.round(performance.now() - startedAt),
		});
		return summary;
	}

	const sendPush = options.sendPush ?? sendPushNotification;
	const requestOptions: RequestOptions = {
		timeout: PUSH_TIMEOUT_MS,
		TTL: PUSH_TTL_SECONDS,
		urgency: "normal",
		topic: "daily-green-reminder",
		vapidDetails: {
			subject: config.subject,
			publicKey: config.publicKey,
			privateKey: config.privateKey,
		},
	};

	const pending = claimedUsers.flatMap((claimedUser) => {
		const payload = JSON.stringify({
			title: "Daily Green",
			body: `今日の習慣があと${claimedUser.incompleteCount}個残っています`,
			url: "/",
		});
		return claimedUser.subscriptions.map((subscription) => ({
			subscription,
			payload,
		}));
	});

	let nextIndex = 0;
	const sendOne = async (entry: (typeof pending)[number]) => {
		const { subscription, payload } = entry;
		const reason = pushEndpointRejectionReason(subscription.endpoint);
		if (reason !== null) {
			summary.skippedUnsafeSubscriptions += 1;
			writeDispatchLog("warn", "unsafe_endpoint_skipped", { reason });
			return;
		}
		const sendDeadline = createPushDeadline(PUSH_TIMEOUT_MS, signal);
		try {
			await withPushDeadline(sendDeadline.signal, () =>
				sendPush(
					toWebPushSubscription(subscription),
					payload,
					requestOptions,
					sendDeadline.signal,
				),
			);
			summary.successfulSubscriptions += 1;
		} catch (error) {
			if (sendDeadline.signal.aborted) summary.timedOutSubscriptions += 1;
			if (isInvalidSubscriptionError(error)) {
				const cleanupDeadline = createPushDeadline(2_000, signal);
				try {
					const removed = await withPushDeadline(cleanupDeadline.signal, () =>
						db.transaction(async (tx) => {
							cleanupDeadline.signal.throwIfAborted();
							await tx.execute(sql`set local statement_timeout = '2s'`);
							cleanupDeadline.signal.throwIfAborted();
							return tx
								.delete(pushSubscription)
								.where(
									and(
										eq(pushSubscription.id, subscription.id),
										// Do not delete a subscription refreshed during the send.
										eq(pushSubscription.p256dh, subscription.p256dh),
										eq(pushSubscription.auth, subscription.auth),
										sql`${pushSubscription.updatedAt} = ${subscription.updatedAtCursor}::timestamptz`,
									),
								)
								.returning({ id: pushSubscription.id });
						}),
					);
					summary.removedInvalidSubscriptions += removed.length;
				} catch {
					summary.failedSubscriptions += 1;
					writeDispatchLog("warn", "invalid_subscription_cleanup_failed", {});
				} finally {
					cleanupDeadline.dispose();
				}
				return;
			}
			summary.failedSubscriptions += 1;
			const rawStatus =
				typeof error === "object" && error !== null && "statusCode" in error
					? (error as { statusCode?: unknown }).statusCode
					: null;
			writeDispatchLog("warn", "subscription_failed", {
				statusCode: typeof rawStatus === "number" ? rawStatus : undefined,
			});
		} finally {
			sendDeadline.dispose();
		}
	};

	const workers = Array.from(
		{ length: Math.min(PUSH_SEND_CONCURRENCY, pending.length) },
		async () => {
			while (nextIndex < pending.length && !signal.aborted) {
				const entry = pending[nextIndex++];
				if (entry) await sendOne(entry);
			}
		},
	);
	await Promise.all(workers);
	summary.skippedByDeadline = pending.length - nextIndex;

	writeDispatchLog("info", "completed", {
		...summary,
		durationMs: Math.round(performance.now() - startedAt),
	});
	return summary;
}
