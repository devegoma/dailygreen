import { and, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
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
import { getPushRuntimeConfig } from "./push-runtime.server";

const PUSH_DISPATCH_LOCK_ID = 1_144_750_163;
const PUSH_TTL_SECONDS = 60 * 60;

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
		const [lockResult] = await tx.select({
			acquired: sql<boolean>`pg_try_advisory_xact_lock(${PUSH_DISPATCH_LOCK_ID})`,
		});
		if (!lockResult?.acquired) {
			return {
				summary: { ...emptySummary(), locked: false },
				claimedUsers: [],
			};
		}

		const candidates = await tx
			.select({ userId: notificationSetting.userId })
			.from(notificationSetting)
			.where(
				and(
					eq(notificationSetting.enabled, true),
					lte(notificationSetting.notifyAt, currentTime),
					or(
						isNull(notificationSetting.lastNotifiedDate),
						ne(notificationSetting.lastNotifiedDate, today),
					),
				),
			);

		const summary = emptySummary();
		summary.candidateUsers = candidates.length;
		const claimedUsers: ClaimedUser[] = [];

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

			const subscriptions = await tx
				.select({
					id: pushSubscription.id,
					endpoint: pushSubscription.endpoint,
					p256dh: pushSubscription.p256dh,
					auth: pushSubscription.auth,
					expirationTime: pushSubscription.expirationTime,
				})
				.from(pushSubscription)
				.where(eq(pushSubscription.userId, candidate.userId));
			if (subscriptions.length === 0) {
				summary.skippedNoSubscriptions += 1;
				continue;
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

			claimedUsers.push({ incompleteCount, subscriptions });
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
		TTL: PUSH_TTL_SECONDS,
		urgency: "normal",
		topic: "daily-green-reminder",
		vapidDetails: {
			subject: config.subject,
			publicKey: config.publicKey,
			privateKey: config.privateKey,
		},
	};

	for (const claimedUser of claimedUsers) {
		const payload = JSON.stringify({
			title: "Daily Green",
			body: `今日の習慣があと${claimedUser.incompleteCount}個残っています`,
			url: "/",
		});

		for (const subscription of claimedUser.subscriptions) {
			try {
				await sendPush(
					toWebPushSubscription(subscription),
					payload,
					requestOptions,
				);
				summary.successfulSubscriptions += 1;
			} catch (error) {
				if (isInvalidSubscriptionError(error)) {
					await db
						.delete(pushSubscription)
						.where(eq(pushSubscription.id, subscription.id));
					summary.removedInvalidSubscriptions += 1;
					continue;
				}
				summary.failedSubscriptions += 1;
				writeDispatchLog("warn", "subscription_failed", {
					statusCode:
						typeof error === "object" && error !== null && "statusCode" in error
							? (error as { statusCode?: unknown }).statusCode
							: undefined,
				});
			}
		}
	}

	writeDispatchLog("info", "completed", {
		...summary,
		durationMs: Math.round(performance.now() - startedAt),
	});
	return summary;
}
