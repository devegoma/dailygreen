import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	Object.assign(process.env, {
		VAPID_PUBLIC_KEY: "test-public-key",
		VAPID_PRIVATE_KEY: "test-private-key",
		VAPID_SUBJECT: "mailto:push@example.test",
	});
});

import { db } from "~/db/index.server";
import {
	dailyRecord,
	habit,
	notificationSetting,
	pushSubscription,
	user,
} from "~/db/schema";
import { dispatchPushNotifications } from "./push-dispatch.service.server";

const now = new Date("2026-08-15T11:00:00.000Z"); // 20:00 JST
const createdUserIds: string[] = [];

async function createUser(prefix: string): Promise<string> {
	const id = `${prefix}-${crypto.randomUUID()}`;
	createdUserIds.push(id);
	await db.insert(user).values({
		id,
		name: id,
		email: `${id}@example.test`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
	return id;
}

async function createHabit(userId: string, name: string): Promise<string> {
	const [row] = await db
		.insert(habit)
		.values({ userId, name, emoji: "", createdAt: now, updatedAt: now })
		.returning({ id: habit.id });
	if (!row) throw new Error("habit insert failed");
	return row.id;
}

async function enableNotifications(userId: string, notifyAt = "20:00:00") {
	await db.insert(notificationSetting).values({
		userId,
		enabled: true,
		notifyAt,
		createdAt: now,
		updatedAt: now,
	});
}

async function addSubscription(userId: string, suffix: string) {
	await db.insert(pushSubscription).values({
		userId,
		endpoint: `https://push.example.test/${suffix}`,
		p256dh: `p256dh-${suffix}`,
		auth: `auth-${suffix}`,
		createdAt: now,
		updatedAt: now,
	});
}

describe("Push dispatch PostgreSQL integration", () => {
	beforeEach(() => {
		createdUserIds.length = 0;
	});

	afterEach(async () => {
		for (const userId of createdUserIds) {
			await db.delete(user).where(eq(user.id, userId));
		}
	});

	it("時刻到達・未達成・Subscriptionありのユーザーだけを同日1回claimする", async () => {
		const dueUser = await createUser("dispatch-due");
		const completedUser = await createUser("dispatch-completed");
		const futureUser = await createUser("dispatch-future");
		const noSubscriptionUser = await createUser("dispatch-no-sub");

		const dueCompletedHabit = await createHabit(dueUser, "A");
		await createHabit(dueUser, "B");
		const completedHabit = await createHabit(completedUser, "C");
		await createHabit(futureUser, "D");
		await createHabit(noSubscriptionUser, "E");

		await db.insert(dailyRecord).values([
			{
				habitId: dueCompletedHabit,
				date: "2026-08-15",
				completedAt: now,
			},
			{
				habitId: completedHabit,
				date: "2026-08-15",
				completedAt: now,
			},
		]);

		await enableNotifications(dueUser);
		await enableNotifications(completedUser);
		await enableNotifications(futureUser, "21:00:00");
		await enableNotifications(noSubscriptionUser);
		await addSubscription(dueUser, "due");
		await addSubscription(completedUser, "completed");
		await addSubscription(futureUser, "future");

		const payloads: string[] = [];
		const first = await dispatchPushNotifications({
			now,
			sendPush: async (_subscription, payload) => {
				payloads.push(payload);
				return {};
			},
		});

		expect(first).toMatchObject({
			locked: true,
			candidateUsers: 3,
			claimedUsers: 1,
			skippedCompleted: 1,
			skippedNoSubscriptions: 1,
			successfulSubscriptions: 1,
		});
		expect(payloads).toHaveLength(1);
		expect(JSON.parse(payloads[0] ?? "{}")).toMatchObject({
			title: "Daily Green",
			body: "今日の習慣があと1個残っています",
			url: "/",
		});

		const second = await dispatchPushNotifications({
			now: new Date(now.getTime() + 30_000),
			sendPush: async () => {
				throw new Error("同日2回目は送信されるべきではありません");
			},
		});
		expect(second.claimedUsers).toBe(0);
	});

	it("404/410相当のSubscriptionを削除し、他のSubscription送信を継続する", async () => {
		const targetUser = await createUser("dispatch-invalid");
		await createHabit(targetUser, "A");
		await enableNotifications(targetUser);
		await addSubscription(targetUser, "gone");
		await addSubscription(targetUser, "ok");

		let calls = 0;
		const summary = await dispatchPushNotifications({
			now,
			sendPush: async (subscription) => {
				calls += 1;
				if (subscription.endpoint.endsWith("/gone")) {
					throw { statusCode: 410 };
				}
				return {};
			},
		});

		expect(calls).toBe(2);
		expect(summary).toMatchObject({
			claimedUsers: 1,
			successfulSubscriptions: 1,
			removedInvalidSubscriptions: 1,
			failedSubscriptions: 0,
		});
		const remaining = await db
			.select({ endpoint: pushSubscription.endpoint })
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, targetUser));
		expect(remaining).toEqual([
			{ endpoint: "https://push.example.test/ok" },
		]);
	});
});
