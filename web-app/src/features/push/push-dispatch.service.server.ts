import { and, count, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type {
	RequestOptions,
	PushSubscription as WebPushSubscription,
} from "web-push";
import webPush from "web-push";
import { db } from "~/db/index.server";
import {
	dailyRecord,
	habit,
	notificationSetting,
	pushSubscription,
} from "~/db/schema";
import { toJstDateString, toJstTimeString } from "~/lib/api/date";
import { pushEndpointRejectionReason } from "./push-endpoint";
import { getPushRuntimeConfig } from "./push-runtime.server";

const PUSH_DISPATCH_LOCK_ID = 1_144_750_163;
const PUSH_TTL_SECONDS = 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;
const PUSH_SEND_CONCURRENCY = 4;
const MAX_CANDIDATES_PER_RUN = 100;
const MAX_SUBSCRIPTIONS_PER_RUN = 20;
const MAX_LEGACY_SUBSCRIPTIONS_PER_USER = 10;

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
};

type ClaimedSubscription = {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	expirationTime: Date | null;
};

type ClaimedUser = {
	incompleteCount: number;
	subscriptions: ClaimedSubscription[];
};

type PushSender = (
	subscription: WebPushSubscription,
	payload: string,
	options: RequestOptions,
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
	};
}

function isInvalidSubscriptionError(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("statusCode" in error)) {
		return false;
	}
	const statusCode = (error as { statusCode?: unknown }).statusCode;
	return statusCode === 404 || statusCode === 410;
}

async function claimDueUsers(now: Date): Promise<{
	summary: PushDispatchSummary;
	claimedUsers: ClaimedUser[];
}> {
	const today = toJstDateString(now);
	const currentTime = toJstTimeString(now);

	return db.transaction(async (tx) => {
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
		const offset = (Math.floor(now.getTime() / 60_000) * MAX_CANDIDATES_PER_RUN)
			% summary.candidateUsers;
		const selectCandidates = (start: number, limit: number) =>
			tx.select({ userId: notificationSetting.userId })
				.from(notificationSetting)
				.where(dueCondition)
				.orderBy(notificationSetting.userId)
				.offset(start)
				.limit(limit);
		const candidates = await selectCandidates(offset, MAX_CANDIDATES_PER_RUN);
		if (candidates.length < MAX_CANDIDATES_PER_RUN && candidates.length < summary.candidateUsers) {
			candidates.push(...await selectCandidates(0, MAX_CANDIDATES_PER_RUN - candidates.length));
		}
		summary.scannedCandidateUsers = candidates.length;
		let reservedSubscriptions = 0;

		for (const candidate of candidates) {
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

			// Tolerate existing over-cap rows, only sending to the 10 most
			// recently refreshed subscriptions. Admin cleanup is documented.
			const subscriptions = await tx
				.select({
					id: pushSubscription.id,
					endpoint: pushSubscription.endpoint,
					p256dh: pushSubscription.p256dh,
					auth: pushSubscription.auth,
					expirationTime: pushSubscription.expirationTime,
				})
				.from(pushSubscription)
				.where(eq(pushSubscription.userId, candidate.userId))
				.orderBy(desc(pushSubscription.updatedAt), desc(pushSubscription.id))
				.limit(MAX_LEGACY_SUBSCRIPTIONS_PER_USER + 1);
			if (subscriptions.length === 0) {
				summary.skippedNoSubscriptions += 1;
				continue;
			}
			if (reservedSubscriptions + Math.min(subscriptions.length, MAX_LEGACY_SUBSCRIPTIONS_PER_USER) > MAX_SUBSCRIPTIONS_PER_RUN) {
				summary.deferredByBudget += 1;
				break;
			}
			if (subscriptions.length > MAX_LEGACY_SUBSCRIPTIONS_PER_USER) {
				summary.truncatedLegacySubscriptions += subscriptions.length - MAX_LEGACY_SUBSCRIPTIONS_PER_USER;
			}

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

			const selected = subscriptions.slice(0, MAX_LEGACY_SUBSCRIPTIONS_PER_USER);
			claimedUsers.push({ incompleteCount, subscriptions: selected });
			reservedSubscriptions += selected.length;
			summary.claimedUsers += 1;
		}

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
	const startedAt = performance.now();
	const now = options.now ?? new Date();
	const config = getPushRuntimeConfig();
	const { summary, claimedUsers } = await claimDueUsers(now);
	if (!summary.locked) {
		writeDispatchLog("info", "skipped_locked", {
			durationMs: Math.round(performance.now() - startedAt),
		});
		return summary;
	}

	const sendPush = options.sendPush ?? webPush.sendNotification.bind(webPush);
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
		return claimedUser.subscriptions.map((subscription) => ({ subscription, payload }));
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
		try {
			await sendPush(toWebPushSubscription(subscription), payload, requestOptions);
			summary.successfulSubscriptions += 1;
		} catch (error) {
			if (isInvalidSubscriptionError(error)) {
				try {
					await db.delete(pushSubscription).where(eq(pushSubscription.id, subscription.id));
					summary.removedInvalidSubscriptions += 1;
				} catch {
					summary.failedSubscriptions += 1;
					writeDispatchLog("warn", "invalid_subscription_cleanup_failed", {});
				}
				return;
			}
			summary.failedSubscriptions += 1;
			const rawStatus = typeof error === "object" && error !== null && "statusCode" in error
				? (error as { statusCode?: unknown }).statusCode : null;
			writeDispatchLog("warn", "subscription_failed", {
				statusCode: typeof rawStatus === "number" ? rawStatus : undefined,
			});
		}
	};

	const workers = Array.from(
		{ length: Math.min(PUSH_SEND_CONCURRENCY, pending.length) },
		async () => {
			while (nextIndex < pending.length) {
				const entry = pending[nextIndex++];
				if (entry) await sendOne(entry);
			}
		},
	);
	await Promise.all(workers);

	writeDispatchLog("info", "completed", {
		...summary,
		durationMs: Math.round(performance.now() - startedAt),
	});
	return summary;
}
