import { and, count, eq } from "drizzle-orm";
import { db } from "~/db/index.server";
import {
	notificationSetting,
	pushRegistrationRateLimit,
	pushSubscription,
	user,
} from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { ApiError } from "~/lib/api/errors";
import { env } from "~/lib/env.server";
import type {
	NotificationSettingsResponse,
	PushSubscriptionRequest,
} from "./push-notifications.api-contract";
import {
	parseDeletePushSubscriptionRequest,
	parsePushSubscriptionRequest,
	parseUpdateNotificationSettingsRequest,
} from "./push-notifications.contract";

const DEFAULT_NOTIFY_AT = "20:00";
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;
const REGISTRATION_RATE_WINDOW_MS = 60_000;
const MAX_REGISTRATION_ATTEMPTS_PER_WINDOW = 20;

function normalizeNotifyAt(value: string): string {
	return value.slice(0, 5);
}

function getClientVapidPublicKey(): string | null {
	return env.VAPID_PUBLIC_KEY &&
		env.VAPID_PRIVATE_KEY &&
		env.VAPID_SUBJECT &&
		env.INTERNAL_JOB_TOKEN
		? env.VAPID_PUBLIC_KEY
		: null;
}

export async function getNotificationSettings(
	user: AuthenticatedUser,
): Promise<NotificationSettingsResponse> {
	const [setting] = await db
		.select({
			enabled: notificationSetting.enabled,
			notifyAt: notificationSetting.notifyAt,
		})
		.from(notificationSetting)
		.where(eq(notificationSetting.userId, user.id))
		.limit(1);

	return {
		enabled: setting?.enabled ?? false,
		notifyAt: setting ? normalizeNotifyAt(setting.notifyAt) : DEFAULT_NOTIFY_AT,
		vapidPublicKey: getClientVapidPublicKey(),
	};
}

export async function updateNotificationSettings(input: {
	user: AuthenticatedUser;
	body: unknown;
	now?: Date;
}): Promise<NotificationSettingsResponse> {
	const request = parseUpdateNotificationSettingsRequest(input.body);
	const now = input.now ?? new Date();
	const values = {
		userId: input.user.id,
		enabled: request.enabled ?? false,
		notifyAt: request.notifyAt ? `${request.notifyAt}:00` : "20:00:00",
		createdAt: now,
		updatedAt: now,
	};

	const updateSet: Partial<typeof values> = { updatedAt: now };
	if (request.enabled !== undefined) {
		updateSet.enabled = request.enabled;
	}
	if (request.notifyAt !== undefined) {
		updateSet.notifyAt = `${request.notifyAt}:00`;
	}

	const [setting] = await db
		.insert(notificationSetting)
		.values(values)
		.onConflictDoUpdate({
			target: notificationSetting.userId,
			set: updateSet,
		})
		.returning({
			enabled: notificationSetting.enabled,
			notifyAt: notificationSetting.notifyAt,
		});

	if (!setting) {
		throw new Error("通知設定の更新結果を取得できませんでした。");
	}

	return {
		enabled: setting.enabled,
		notifyAt: normalizeNotifyAt(setting.notifyAt),
		vapidPublicKey: getClientVapidPublicKey(),
	};
}

function expirationDate(request: PushSubscriptionRequest): Date | null {
	if (request.expirationTime === null) {
		return null;
	}
	return new Date(request.expirationTime);
}

/**
 * Count attempts even if the subsequent registration is rejected (ownership
 * conflict, cap etc). Separate committed transaction avoids rolling back
 * the rate counter along with a failed registration.
 */
async function consumePushRegistrationBudget(
	userId: string,
	now: Date,
): Promise<void> {
	await db.transaction(async (tx) => {
		const lockedUser = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, userId))
			.for("update");
		if (lockedUser.length === 0) {
			throw new ApiError("UNAUTHORIZED");
		}

		const [current] = await tx
			.select()
			.from(pushRegistrationRateLimit)
			.where(eq(pushRegistrationRateLimit.userId, userId))
			.limit(1);

		if (
			current &&
			now.getTime() - current.windowStartedAt.getTime() <
				REGISTRATION_RATE_WINDOW_MS
		) {
			if (current.attemptCount >= MAX_REGISTRATION_ATTEMPTS_PER_WINDOW) {
				throw new ApiError("PUSH_REGISTRATION_RATE_LIMITED");
			}
			await tx
				.update(pushRegistrationRateLimit)
				.set({ attemptCount: current.attemptCount + 1 })
				.where(eq(pushRegistrationRateLimit.userId, userId));
		} else {
			await tx
				.insert(pushRegistrationRateLimit)
				.values({ userId, windowStartedAt: now, attemptCount: 1 })
				.onConflictDoUpdate({
					target: pushRegistrationRateLimit.userId,
					set: { windowStartedAt: now, attemptCount: 1 },
				});
		}
	});
}

export async function upsertPushSubscription(input: {
	user: AuthenticatedUser;
	body: unknown;
	now?: Date;
}): Promise<void> {
	const request = parsePushSubscriptionRequest(input.body);
	const now = input.now ?? new Date();

	await consumePushRegistrationBudget(input.user.id, now);

	await db.transaction(async (tx) => {
		// Serializes count+insert even for concurrent requests on different
		// endpoints. The user row always exists for authenticated users.
		const lockedUser = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, input.user.id))
			.for("update");
		if (lockedUser.length === 0) {
			throw new ApiError("UNAUTHORIZED");
		}

		const [existing] = await tx
			.select({ userId: pushSubscription.userId })
			.from(pushSubscription)
			.where(eq(pushSubscription.endpoint, request.endpoint))
			.limit(1);

		if (existing && existing.userId !== input.user.id) {
			throw new ApiError("PUSH_SUBSCRIPTION_CONFLICT");
		}

		if (!existing) {
			const [total] = await tx
				.select({ count: count() })
				.from(pushSubscription)
				.where(eq(pushSubscription.userId, input.user.id));
			if ((total?.count ?? 0) >= MAX_PUSH_SUBSCRIPTIONS_PER_USER) {
				throw new ApiError("PUSH_SUBSCRIPTION_LIMIT_EXCEEDED");
			}
		}

		const updated = await tx
			.insert(pushSubscription)
			.values({
				userId: input.user.id,
				endpoint: request.endpoint,
				p256dh: request.keys.p256dh,
				auth: request.keys.auth,
				expirationTime: expirationDate(request),
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: pushSubscription.endpoint,
				// Never update userId, and verify the existing owner atomically.
				set: {
					p256dh: request.keys.p256dh,
					auth: request.keys.auth,
					expirationTime: expirationDate(request),
					updatedAt: now,
				},
				setWhere: eq(pushSubscription.userId, input.user.id),
			})
			.returning({ id: pushSubscription.id });
		// Another user may have inserted this endpoint after the SELECT.
		if (updated.length === 0) {
			throw new ApiError("PUSH_SUBSCRIPTION_CONFLICT");
		}
	});
}

export async function deletePushSubscription(input: {
	user: AuthenticatedUser;
	body: unknown;
}): Promise<void> {
	const request = parseDeletePushSubscriptionRequest(input.body);
	await db
		.delete(pushSubscription)
		.where(
			and(
				eq(pushSubscription.endpoint, request.endpoint),
				eq(pushSubscription.userId, input.user.id),
			),
		);
}
