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

const endpoint = "https://fcm.googleapis.com/fcm/send/shared";

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
		await db
			.delete(pushSubscription)
			.where(eq(pushSubscription.endpoint, endpoint));
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

	it("他ユーザーのendpoint再登録は409で拒否し所有者も鍵も保持する", async () => {
		await upsertPushSubscription({
			user: firstUser,
			body: subscriptionBody(),
			now,
		});
		await expect(
			upsertPushSubscription({
				user: secondUser,
				body: subscriptionBody({ p256dh: "public-key-b", auth: "auth-b" }),
				now,
			}),
		).rejects.toMatchObject({
			code: "PUSH_SUBSCRIPTION_CONFLICT",
			status: 409,
		});

		const rows = await db
			.select({
				userId: pushSubscription.userId,
				p256dh: pushSubscription.p256dh,
				auth: pushSubscription.auth,
			})
			.from(pushSubscription)
			.where(eq(pushSubscription.endpoint, endpoint));
		expect(rows).toEqual([
			{
				userId: firstUser.id,
				p256dh: "public-key-a",
				auth: "auth-a",
			},
		]);
	});

	it("同じ所有者の冪等な再登録では鍵だけ更新できる", async () => {
		await upsertPushSubscription({
			user: firstUser,
			body: subscriptionBody(),
			now,
		});
		await upsertPushSubscription({
			user: firstUser,
			body: subscriptionBody({ p256dh: "public-key-b", auth: "auth-b" }),
			now: new Date(now.getTime() + 1_000),
		});
		const rows = await db
			.select()
			.from(pushSubscription)
			.where(eq(pushSubscription.endpoint, endpoint));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			userId: firstUser.id,
			p256dh: "public-key-b",
			auth: "auth-b",
		});
	});

	it("10件を超えた新規登録は拒否し10件目の冪等登録は許可する", async () => {
		for (let i = 0; i < 10; i += 1) {
			await upsertPushSubscription({
				user: firstUser,
				body: {
					...subscriptionBody(),
					endpoint: `https://fcm.googleapis.com/fcm/send/cap-${i}`,
				},
				now,
			});
		}
		await upsertPushSubscription({
			user: firstUser,
			body: {
				...subscriptionBody({ auth: "new-secret" }),
				endpoint: "https://fcm.googleapis.com/fcm/send/cap-0",
			},
			now,
		});
		await expect(
			upsertPushSubscription({
				user: firstUser,
				body: {
					...subscriptionBody(),
					endpoint: "https://fcm.googleapis.com/fcm/send/eleventh",
				},
				now,
			}),
		).rejects.toMatchObject({
			code: "PUSH_SUBSCRIPTION_LIMIT_EXCEEDED",
			status: 409,
		});

		const rows = await db
			.select()
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, firstUser.id));
		expect(rows).toHaveLength(10);
	});

	it("12件の同時登録でもDB行ロックで10件に収まる", async () => {
		const outcomes = await Promise.allSettled(
			Array.from({ length: 12 }, (_, i) =>
				upsertPushSubscription({
					user: firstUser,
					body: {
						...subscriptionBody(),
						endpoint: `https://fcm.googleapis.com/fcm/send/concurrent-${i}`,
					},
					now,
				}),
			),
		);
		expect(
			outcomes.filter((result) => result.status === "fulfilled"),
		).toHaveLength(10);
		expect(
			outcomes.filter((result) => result.status === "rejected"),
		).toHaveLength(2);
		const rows = await db
			.select()
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, firstUser.id));
		expect(rows).toHaveLength(10);
	});

	it("未許可の既存購読を保持したまま、並列登録でも有効な購読だけ10件に制限する", async () => {
		await db.insert(pushSubscription).values(
			Array.from({ length: 105 }, (_, index) => ({
				userId: firstUser.id,
				endpoint: `https://unknown.example.test/legacy-${index}`,
				p256dh: "legacy-key",
				auth: "legacy-auth",
				createdAt: now,
				updatedAt: new Date(now.getTime() + 1000),
			})),
		);
		const outcomes = await Promise.allSettled(
			Array.from({ length: 12 }, (_, index) =>
				upsertPushSubscription({
					user: firstUser,
					now,
					body: {
						...subscriptionBody(),
						endpoint: `https://fcm.googleapis.com/fcm/send/eligible-${index}`,
					},
				}),
			),
		);
		expect(
			outcomes.filter((outcome) => outcome.status === "fulfilled"),
		).toHaveLength(10);
		for (const outcome of outcomes) {
			if (outcome.status === "rejected")
				expect(outcome.reason).toMatchObject({
					code: "PUSH_SUBSCRIPTION_LIMIT_EXCEEDED",
				});
		}
		const rows = await db
			.select()
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, firstUser.id));
		expect(rows).toHaveLength(115);
		expect(
			rows.filter((row) =>
				row.endpoint.startsWith("https://unknown.example.test/"),
			),
		).toHaveLength(105);
	});

	it("60秒間の21回目の登録試行は429、時間経過後は再登録できる", async () => {
		for (let i = 0; i < 20; i += 1) {
			await upsertPushSubscription({
				user: firstUser,
				body: subscriptionBody(),
				now,
			});
		}
		await expect(
			upsertPushSubscription({
				user: firstUser,
				body: subscriptionBody(),
				now,
			}),
		).rejects.toMatchObject({
			code: "PUSH_REGISTRATION_RATE_LIMITED",
			status: 429,
		});
		await expect(
			upsertPushSubscription({
				user: firstUser,
				body: subscriptionBody(),
				now: new Date(now.getTime() + 60_000),
			}),
		).resolves.toBeUndefined();
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
