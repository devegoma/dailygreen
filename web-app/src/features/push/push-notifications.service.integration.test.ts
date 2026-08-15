import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/index.server";
import { notificationSetting, pushSubscription, user } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import {
	deletePushSubscription,
	getNotificationSettings,
	updateNotificationSettings,
	upsertPushSubscription,
} from "./push-notifications.service.server";

const now = new Date("2026-08-15T03:00:00.000Z");
let firstUser: AuthenticatedUser;
let secondUser: AuthenticatedUser;

async function insertUser(authenticatedUser: AuthenticatedUser) {
	await db.insert(user).values({
		id: authenticatedUser.id,
		name: authenticatedUser.id,
		email: `${authenticatedUser.id}@example.test`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
}

const endpoint = "https://push.example.test/subscription/shared";

function subscriptionBody(options: { p256dh?: string; auth?: string } = {}) {
	return {
		endpoint,
		expirationTime: 1_800_000_000_000,
		keys: {
			p256dh: options.p256dh ?? "public-key-a",
			auth: options.auth ?? "auth-a",
		},
	};
}

describe("Push notification PostgreSQL integration", () => {
	beforeEach(async (context) => {
		firstUser = {
			id: `push-a-${context.task.id}-${crypto.randomUUID()}`,
		} as AuthenticatedUser;
		secondUser = {
			id: `push-b-${context.task.id}-${crypto.randomUUID()}`,
		} as AuthenticatedUser;
		await insertUser(firstUser);
		await insertUser(secondUser);
	});

	afterEach(async () => {
		await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
		await db
			.delete(notificationSetting)
			.where(eq(notificationSetting.userId, firstUser.id));
		await db
			.delete(notificationSetting)
			.where(eq(notificationSetting.userId, secondUser.id));
		await db.delete(user).where(eq(user.id, firstUser.id));
		await db.delete(user).where(eq(user.id, secondUser.id));
	});

	it("設定行がない場合は通知OFF・20:00を返す", async () => {
		await expect(getNotificationSettings(firstUser)).resolves.toEqual({
			enabled: false,
			notifyAt: "20:00",
			vapidPublicKey: null,
		});
	});

	it("部分更新でも既存の通知設定を保持する", async () => {
		await updateNotificationSettings({
			user: firstUser,
			body: { enabled: true },
			now,
		});
		const result = await updateNotificationSettings({
			user: firstUser,
			body: { notifyAt: "21:45" },
			now: new Date(now.getTime() + 1_000),
		});

		expect(result).toEqual({
			enabled: true,
			notifyAt: "21:45",
			vapidPublicKey: null,
		});
	});

	it("同じendpointの再登録時は現在ユーザーへ所有権と鍵を移す", async () => {
		await upsertPushSubscription({
			user: firstUser,
			body: subscriptionBody(),
			now,
		});
		await upsertPushSubscription({
			user: secondUser,
			body: subscriptionBody({ p256dh: "public-key-b", auth: "auth-b" }),
			now: new Date(now.getTime() + 1_000),
		});

		const rows = await db
			.select({
				userId: pushSubscription.userId,
				p256dh: pushSubscription.p256dh,
				auth: pushSubscription.auth,
				expirationTime: pushSubscription.expirationTime,
			})
			.from(pushSubscription)
			.where(eq(pushSubscription.endpoint, endpoint));

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			userId: secondUser.id,
			p256dh: "public-key-b",
			auth: "auth-b",
			expirationTime: new Date(1_800_000_000_000),
		});
	});

	it("別ユーザーは解除できず、所有者の解除は冪等に成功する", async () => {
		await upsertPushSubscription({
			user: secondUser,
			body: subscriptionBody(),
			now,
		});

		await deletePushSubscription({
			user: firstUser,
			body: { endpoint },
		});
		const afterOtherUser = await db
			.select({ id: pushSubscription.id })
			.from(pushSubscription)
			.where(eq(pushSubscription.endpoint, endpoint));
		expect(afterOtherUser).toHaveLength(1);

		await deletePushSubscription({
			user: secondUser,
			body: { endpoint },
		});
		await deletePushSubscription({
			user: secondUser,
			body: { endpoint },
		});
		const afterOwner = await db
			.select({ id: pushSubscription.id })
			.from(pushSubscription)
			.where(eq(pushSubscription.endpoint, endpoint));
		expect(afterOwner).toHaveLength(0);
	});
});
