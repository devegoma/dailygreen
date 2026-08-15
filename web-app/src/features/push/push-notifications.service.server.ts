import { and, eq } from "drizzle-orm";
import { db } from "~/db/index.server";
import { notificationSetting, pushSubscription } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
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

function normalizeNotifyAt(value: string): string {
	return value.slice(0, 5);
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
		vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
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
		vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
	};
}

function expirationDate(request: PushSubscriptionRequest): Date | null {
	if (request.expirationTime === null) {
		return null;
	}
	return new Date(request.expirationTime);
}

export async function upsertPushSubscription(input: {
	user: AuthenticatedUser;
	body: unknown;
	now?: Date;
}): Promise<void> {
	const request = parsePushSubscriptionRequest(input.body);
	const now = input.now ?? new Date();

	await db
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
			set: {
				userId: input.user.id,
				p256dh: request.keys.p256dh,
				auth: request.keys.auth,
				expirationTime: expirationDate(request),
				updatedAt: now,
			},
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
