import { eq, sql } from "drizzle-orm";
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
		endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
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
		vi.useRealTimers();
		vi.restoreAllMocks();
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
					const goneError = Object.assign(new Error("subscription gone"), {
						statusCode: 410,
					});
					throw goneError;
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
			{ endpoint: "https://fcm.googleapis.com/fcm/send/ok" },
		]);
	});
	it("DBに紛れた未許可endpointは送信せず理由を集計する", async () => {
		const targetUser = await createUser("dispatch-unsafe");
		await createHabit(targetUser, "A");
		await enableNotifications(targetUser);
		await addSubscription(targetUser, "safe");
		await db.insert(pushSubscription).values({
			userId: targetUser,
			endpoint: "https://unsafe.example.test/private",
			p256dh: "p256dh",
			auth: "auth",
			createdAt: now,
			updatedAt: now,
		});

		const delivered: string[] = [];
		const summary = await dispatchPushNotifications({
			now,
			sendPush: async (subscription) => {
				delivered.push(subscription.endpoint);
				return {};
			},
		});
		expect(delivered).toEqual(["https://fcm.googleapis.com/fcm/send/safe"]);
		expect(summary).toMatchObject({
			claimedUsers: 1,
			successfulSubscriptions: 1,
			skippedUnsafeSubscriptions: 1,
		});
		const rows = await db
			.select()
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, targetUser));
		expect(rows).toHaveLength(2);
	});

	it("新しい未許可レコードが100件以上あっても有効購読の枠を塞がず秘密値をログに出さない", async () => {
		const targetUser = await createUser("dispatch-inactive");
		await createHabit(targetUser, "A");
		await enableNotifications(targetUser);
		await addSubscription(targetUser, "older-valid");
		await db.insert(pushSubscription).values(
			Array.from({ length: 105 }, (_, index) => ({
				userId: targetUser,
				endpoint: `https://unknown.example.test/private-${index}`,
				p256dh: "sensitive-public-key",
				auth: "sensitive-auth",
				createdAt: now,
				updatedAt: new Date(now.getTime() + 1000),
			})),
		);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const sendPush = vi.fn().mockResolvedValue({});
		const result = await dispatchPushNotifications({ now, sendPush });
		expect(result).toMatchObject({
			successfulSubscriptions: 1,
			skippedUnsafeSubscriptions: 105,
			truncatedLegacySubscriptions: 0,
		});
		expect(sendPush).toHaveBeenCalledTimes(1);
		const logs = JSON.stringify([warn.mock.calls, info.mock.calls]);
		expect(logs).not.toMatch(/https:|unknown\.example|sensitive-|older-valid/);
	});

	it("未許可購読だけのユーザーはclaimせず有効化後に当日中の送信ができる", async () => {
		const targetUser = await createUser("dispatch-only-inactive");
		await createHabit(targetUser, "A");
		await enableNotifications(targetUser);
		await db.insert(pushSubscription).values({
			userId: targetUser,
			endpoint: "https://unknown.example.test/a",
			p256dh: "public",
			auth: "auth",
		});
		const sendPush = vi.fn().mockResolvedValue({});
		expect(await dispatchPushNotifications({ now, sendPush })).toMatchObject({
			claimedUsers: 0,
			skippedUnsafeSubscriptions: 1,
		});
		const [setting] = await db
			.select()
			.from(notificationSetting)
			.where(eq(notificationSetting.userId, targetUser));
		expect(setting.lastNotifiedDate).toBeNull();
		await addSubscription(targetUser, "now-valid");
		expect(await dispatchPushNotifications({ now, sendPush })).toMatchObject({
			claimedUsers: 1,
			successfulSubscriptions: 1,
		});
	});

	it("DB時刻にマイクロ秒がある既存データでもページ境界の正常購読を見落とさない", async () => {
		const targetUser = await createUser("dispatch-microseconds");
		await createHabit(targetUser, "A");
		await enableNotifications(targetUser);
		const updatedAt = sql`'2026-08-15T11:00:00.000001Z'::timestamptz`;
		await db.insert(pushSubscription).values(
			Array.from({ length: 105 }, (_, index) => ({
				id: `10000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
				userId: targetUser,
				endpoint: `https://unknown.example.test/microseconds-${index}`,
				p256dh: "public",
				auth: "auth",
				updatedAt,
			})),
		);
		await db.insert(pushSubscription).values({
			id: "00000000-0000-4000-8000-000000000001",
			userId: targetUser,
			endpoint: "https://fcm.googleapis.com/fcm/send/microseconds",
			p256dh: "public",
			auth: "auth",
			updatedAt,
		});
		const sendPush = vi.fn().mockRejectedValue({ statusCode: 410 });
		expect(await dispatchPushNotifications({ now, sendPush })).toMatchObject({
			claimedUsers: 1,
			removedInvalidSubscriptions: 1,
			skippedUnsafeSubscriptions: 105,
		});
		expect(sendPush).toHaveBeenCalledTimes(1);
	});

	it("最大20件すべてが停滞しても5波50秒で打ち切り当日再送しない", async () => {
		for (let userIndex = 0; userIndex < 2; userIndex += 1) {
			const userId = await createUser(`dispatch-stalled-${userIndex}`);
			await createHabit(userId, "A");
			await enableNotifications(userId);
			for (let index = 0; index < 10; index += 1)
				await addSubscription(userId, `stalled-${userIndex}-${index}`);
		}
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		let started: () => void = () => {};
		const firstSend = new Promise<void>((resolve) => {
			started = resolve;
		});
		const signals: AbortSignal[] = [];
		const result = dispatchPushNotifications({
			now,
			sendPush: async (_sub, _payload, _options, signal) => {
				signals.push(signal);
				started();
				return new Promise(() => {});
			},
		});
		await firstSend;
		await vi.advanceTimersByTimeAsync(50_000);
		expect(await result).toMatchObject({
			claimedUsers: 2,
			failedSubscriptions: 20,
			timedOutSubscriptions: 20,
			skippedByDeadline: 0,
		});
		expect(signals).toHaveLength(20);
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		vi.useRealTimers();
		const sendPush = vi.fn().mockResolvedValue({});
		expect(await dispatchPushNotifications({ now, sendPush })).toMatchObject({
			claimedUsers: 0,
		});
		expect(sendPush).not.toHaveBeenCalled();
	});

	it("古い送信への410で送信中に更新された購読を削除しない", async () => {
		const targetUser = await createUser("dispatch-refresh");
		await createHabit(targetUser, "A");
		await enableNotifications(targetUser);
		await addSubscription(targetUser, "refreshed");
		await dispatchPushNotifications({
			now,
			sendPush: async () => {
				await db
					.update(pushSubscription)
					.set({ updatedAt: new Date(now.getTime() + 1000) })
					.where(eq(pushSubscription.userId, targetUser));
				throw Object.assign(new Error("gone"), { statusCode: 410 });
			},
		});
		expect(
			await db
				.select()
				.from(pushSubscription)
				.where(eq(pushSubscription.userId, targetUser)),
		).toHaveLength(1);
	});

	it("送信数20件と同時実行4件までに制限しタイムアウトを10秒に設定する", async () => {
		for (let userIndex = 0; userIndex < 3; userIndex += 1) {
			const userId = await createUser(`dispatch-budget-${userIndex}`);
			await createHabit(userId, "A");
			await enableNotifications(userId);
			for (let index = 0; index < 10; index += 1) {
				await addSubscription(userId, `budget-${userIndex}-${index}`);
			}
		}

		let inFlight = 0;
		let peak = 0;
		const timeouts: number[] = [];
		const summary = await dispatchPushNotifications({
			now,
			sendPush: async (_subscription, _payload, options) => {
				timeouts.push(options.timeout ?? 0);
				inFlight += 1;
				peak = Math.max(peak, inFlight);
				await new Promise((resolve) => setTimeout(resolve, 2));
				inFlight -= 1;
				return {};
			},
		});
		expect(summary.claimedUsers).toBe(2);
		expect(summary.successfulSubscriptions).toBe(20);
		expect(summary.deferredByBudget).toBeGreaterThan(0);
		expect(peak).toBeGreaterThan(1);
		expect(peak).toBeLessThanOrEqual(4);
		expect(timeouts).toEqual(Array.from({ length: 20 }, () => 10_000));
		const deferredSender = vi.fn().mockResolvedValue({});
		expect(
			await dispatchPushNotifications({ now, sendPush: deferredSender }),
		).toMatchObject({ claimedUsers: 1, successfulSubscriptions: 10 });
		expect(deferredSender).toHaveBeenCalledTimes(10);
	});

	it("失敗した購読と他の購読の送信を隔離する", async () => {
		const targetUser = await createUser("dispatch-failed");
		await createHabit(targetUser, "A");
		await enableNotifications(targetUser);
		await addSubscription(targetUser, "fail");
		await addSubscription(targetUser, "success");
		const summary = await dispatchPushNotifications({
			now,
			sendPush: async (subscription) => {
				if (subscription.endpoint.endsWith("/fail")) throw new Error("timeout");
				return {};
			},
		});
		expect(summary).toMatchObject({
			successfulSubscriptions: 1,
			failedSubscriptions: 1,
		});
	});
});
