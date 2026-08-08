import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/index.server";
import { dailyRecord, habit, user } from "~/db/schema";
import {
	archiveHabit,
	completeHabit,
	updateHabit,
} from "~/features/habits/habits.service.server";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { addDaysToJstDateString } from "~/lib/api/date";
import { getHomeData, type HomeDataResponse } from "./home.service.server";

const now = new Date("2026-07-12T03:00:00.000Z");
const initialUpdatedAt = new Date("2026-07-01T03:00:00.000Z");
let owner: AuthenticatedUser;

async function insertHabit(
	values: Partial<typeof habit.$inferInsert> = {},
): Promise<typeof habit.$inferSelect> {
	const [created] = await db
		.insert(habit)
		.values({
			userId: owner.id,
			name: "読書",
			emoji: "📚",
			createdAt: new Date("2026-07-01T03:00:00.000Z"),
			updatedAt: initialUpdatedAt,
			...values,
		})
		.returning();

	if (!created) {
		throw new Error("テスト用habitを作成できませんでした。");
	}
	return created;
}

async function insertRecord(habitId: string, date: string): Promise<void> {
	await db.insert(dailyRecord).values({
		habitId,
		date,
		completedAt: new Date(`${date}T03:00:00.000Z`),
	});
}

function getActivity(
	result: HomeDataResponse,
	date: string,
): HomeDataResponse["activityLog"][number] {
	const entry = result.activityLog.find((item) => item.date === date);
	if (!entry) {
		throw new Error(`${date}のActivity Logがありません。`);
	}
	return entry;
}

async function waitForHabitLockWaiters(expected: number): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const result = await db.execute(sql`
			select count(*)::int as "waiting"
			from pg_stat_activity
			where datname = current_database()
				and pid <> pg_backend_pid()
				and wait_event_type = 'Lock'
				and query ilike '%from "habit"%for update%'
		`);
		if (Number(result[0]?.waiting ?? 0) >= expected) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`habit行ロックの待機数が${expected}件になりませんでした。`);
}

async function runHabitOperationsInOrder<TFirst, TSecond>(
	habitId: string,
	first: () => Promise<TFirst>,
	second: () => Promise<TSecond>,
): Promise<[PromiseSettledResult<TFirst>, PromiseSettledResult<TSecond>]> {
	let releaseBlocker: (() => void) | undefined;
	let notifyLocked: (() => void) | undefined;
	const blockerRelease = new Promise<void>((resolve) => {
		releaseBlocker = resolve;
	});
	const blockerLocked = new Promise<void>((resolve) => {
		notifyLocked = resolve;
	});

	const blocker = db.transaction(async (tx) => {
		await tx
			.select({ id: habit.id })
			.from(habit)
			.where(eq(habit.id, habitId))
			.for("update");
		notifyLocked?.();
		await blockerRelease;
	});

	await blockerLocked;
	let firstPromise: Promise<TFirst> | undefined;
	let secondPromise: Promise<TSecond> | undefined;
	try {
		firstPromise = first();
		await waitForHabitLockWaiters(1);
		secondPromise = second();
		await waitForHabitLockWaiters(2);
		releaseBlocker?.();
		return await Promise.allSettled([firstPromise, secondPromise]);
	} finally {
		releaseBlocker?.();
		await Promise.allSettled([
			blocker,
			...(firstPromise ? [firstPromise] : []),
			...(secondPromise ? [secondPromise] : []),
		]);
	}
}

describe("getHomeData PostgreSQL integration", () => {
	beforeEach(async (context) => {
		owner = {
			id: `home-${context.task.id}-${crypto.randomUUID()}`,
		} as AuthenticatedUser;
		await db.insert(user).values({
			id: owner.id,
			name: owner.id,
			email: `${owner.id}@example.test`,
			emailVerified: true,
			createdAt: initialUpdatedAt,
			updatedAt: initialUpdatedAt,
		});
	});

	afterEach(async () => {
		await db.delete(habit).where(eq(habit.userId, owner.id));
		await db.delete(user).where(eq(user.id, owner.id));
	});

	it("habitがなくても今日を含む365日をoldestから昇順で返す", async () => {
		const result = await getHomeData({ user: owner, now });

		expect(result.habits).toEqual([]);
		expect(result.activityLog).toHaveLength(365);
		expect(result.activityLog[0]).toEqual({
			date: "2025-07-13",
			completionRate: null,
		});
		expect(result.activityLog.at(-1)).toEqual({
			date: "2026-07-12",
			completionRate: null,
		});
		for (let index = 1; index < result.activityLog.length; index += 1) {
			expect(result.activityLog[index].date).toBe(
				addDaysToJstDateString(result.activityLog[index - 1].date, 1),
			);
		}
	});

	it("active habitだけをname、createdAt、idの順に安定ソートする", async () => {
		const early = new Date("2026-07-01T00:00:00.000Z");
		const late = new Date("2026-07-02T00:00:00.000Z");
		const ids = {
			nameFirst: "00000000-0000-4000-8000-000000000004",
			idFirst: "00000000-0000-4000-8000-000000000001",
			idSecond: "00000000-0000-4000-8000-000000000002",
			createdLater: "00000000-0000-4000-8000-000000000003",
		};
		await insertHabit({ id: ids.createdLater, name: "b", createdAt: late });
		await insertHabit({ id: ids.idSecond, name: "b", createdAt: early });
		await insertHabit({ id: ids.nameFirst, name: "a", createdAt: late });
		await insertHabit({ id: ids.idFirst, name: "b", createdAt: early });
		await insertHabit({ name: "0", archivedAt: now });

		const result = await getHomeData({ user: owner, now });

		expect(result.habits.map((item) => item.id)).toEqual([
			ids.nameFirst,
			ids.idFirst,
			ids.idSecond,
			ids.createdLater,
		]);
	});

	it("JST 23:59:59と00:00でisCompletedTodayの対象日を切り替える", async () => {
		const target = await insertHabit();
		await insertRecord(target.id, "2026-07-11");

		const beforeMidnight = await getHomeData({
			user: owner,
			now: new Date("2026-07-11T14:59:59.999Z"),
		});
		const midnight = await getHomeData({
			user: owner,
			now: new Date("2026-07-11T15:00:00.000Z"),
		});

		expect(beforeMidnight.habits[0].isCompletedToday).toBe(true);
		expect(beforeMidnight.activityLog.at(-1)?.date).toBe("2026-07-11");
		expect(beforeMidnight.activityLog.at(-1)?.completionRate).toBeNull();
		expect(midnight.habits[0].isCompletedToday).toBe(false);
		expect(midnight.activityLog.at(-1)?.date).toBe("2026-07-12");
	});

	it("期限切れstreakだけを0へ補正し、昨日・今日・既存0を変更しない", async () => {
		const noRecord = await insertHabit({ name: "no-record", currentStreak: 3 });
		const old = await insertHabit({ name: "old", currentStreak: 4 });
		const yesterday = await insertHabit({
			name: "yesterday",
			currentStreak: 5,
		});
		const today = await insertHabit({ name: "today", currentStreak: 6 });
		const zero = await insertHabit({ name: "zero", currentStreak: 0 });
		await insertRecord(old.id, "2026-07-10");
		await insertRecord(yesterday.id, "2026-07-11");
		await insertRecord(today.id, "2026-07-12");

		const result = await getHomeData({ user: owner, now });
		const responseById = new Map(result.habits.map((item) => [item.id, item]));

		expect(responseById.get(noRecord.id)?.currentStreak).toBe(0);
		expect(responseById.get(old.id)?.currentStreak).toBe(0);
		expect(responseById.get(yesterday.id)?.currentStreak).toBe(5);
		expect(responseById.get(today.id)?.currentStreak).toBe(6);
		expect(responseById.get(zero.id)?.currentStreak).toBe(0);

		const stored = await db
			.select()
			.from(habit)
			.where(eq(habit.userId, owner.id));
		const storedById = new Map(stored.map((item) => [item.id, item]));
		expect(storedById.get(noRecord.id)).toMatchObject({
			currentStreak: 0,
			updatedAt: now,
		});
		expect(storedById.get(old.id)).toMatchObject({
			currentStreak: 0,
			updatedAt: now,
		});
		for (const unchanged of [yesterday, today, zero]) {
			expect(storedById.get(unchanged.id)).toMatchObject({
				currentStreak: unchanged.currentStreak,
				updatedAt: initialUpdatedAt,
			});
		}
	});

	it("createdAtの日末境界でActivity Logの分母と分子を判定する", async () => {
		const beforeBoundary = await insertHabit({
			name: "before",
			createdAt: new Date("2026-07-10T14:59:59.999Z"),
		});
		const atBoundary = await insertHabit({
			name: "at",
			createdAt: new Date("2026-07-10T15:00:00.000Z"),
		});
		await insertHabit({
			name: "existing",
			createdAt: new Date("2026-07-09T03:00:00.000Z"),
		});
		await insertRecord(beforeBoundary.id, "2026-07-10");
		await insertRecord(atBoundary.id, "2026-07-10");
		await insertRecord(beforeBoundary.id, "2026-07-11");
		await insertRecord(atBoundary.id, "2026-07-11");

		const result = await getHomeData({ user: owner, now });

		expect(getActivity(result, "2026-07-10").completionRate).toBe(0.5);
		expect(getActivity(result, "2026-07-11").completionRate).toBeCloseTo(2 / 3);
		expect(getActivity(result, "2026-07-09").completionRate).toBe(0);
		expect(getActivity(result, "2025-07-13").completionRate).toBeNull();
		expect(getActivity(result, "2026-07-12").completionRate).toBeNull();
	});

	it("archive後はhabitと全過去日の分子・分母から除外して再集計する", async () => {
		const completed = await insertHabit({ name: "completed" });
		const incomplete = await insertHabit({ name: "incomplete" });
		await insertRecord(completed.id, "2026-07-10");

		const before = await getHomeData({ user: owner, now });
		expect(getActivity(before, "2026-07-10").completionRate).toBe(0.5);

		await archiveHabit({ user: owner, habitId: completed.id, now });
		const after = await getHomeData({ user: owner, now });

		expect(after.habits.map((item) => item.id)).toEqual([incomplete.id]);
		expect(getActivity(after, "2026-07-10").completionRate).toBe(0);

		await archiveHabit({ user: owner, habitId: incomplete.id, now });
		const afterAll = await getHomeData({ user: owner, now });
		expect(afterAll.habits).toEqual([]);
		expect(getActivity(afterAll, "2026-07-10").completionRate).toBeNull();
	});

	it("complete先行時は当日recordとstreakを保持してhomeの古い補正で上書きしない", async () => {
		const target = await insertHabit({ currentStreak: 7, maxStreak: 7 });
		const [completeResult, homeResult] = await runHabitOperationsInOrder(
			target.id,
			() => completeHabit({ user: owner, habitId: target.id, now }),
			() => getHomeData({ user: owner, now }),
		);

		expect(completeResult).toMatchObject({
			status: "fulfilled",
			value: { habit: { currentStreak: 1 } },
		});
		expect(homeResult).toMatchObject({
			status: "fulfilled",
			value: { habits: [{ currentStreak: 1, isCompletedToday: true }] },
		});
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored.currentStreak).toBe(1);
	});

	it("home先行時は期限切れ補正後にcompleteがstreakを1で開始する", async () => {
		const target = await insertHabit({ currentStreak: 7, maxStreak: 7 });
		const [homeResult, completeResult] = await runHabitOperationsInOrder(
			target.id,
			() => getHomeData({ user: owner, now }),
			() => completeHabit({ user: owner, habitId: target.id, now }),
		);

		expect(homeResult).toMatchObject({
			status: "fulfilled",
			value: { habits: [{ currentStreak: 0, isCompletedToday: false }] },
		});
		expect(completeResult).toMatchObject({
			status: "fulfilled",
			value: { habit: { currentStreak: 1, maxStreak: 7 } },
		});
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored.currentStreak).toBe(1);
	});

	it("archive先行時はhomeの固定active集合から除外する", async () => {
		const target = await insertHabit();
		await insertRecord(target.id, "2026-07-10");
		const [archiveResult, homeResult] = await runHabitOperationsInOrder(
			target.id,
			() => archiveHabit({ user: owner, habitId: target.id, now }),
			() => getHomeData({ user: owner, now }),
		);

		expect(archiveResult).toMatchObject({ status: "fulfilled" });
		expect(homeResult).toMatchObject({
			status: "fulfilled",
			value: { habits: [] },
		});
		if (homeResult.status === "fulfilled") {
			expect(
				getActivity(homeResult.value, "2026-07-10").completionRate,
			).toBeNull();
		}
	});

	it("home先行時はactive固定集合を返した後にarchiveを成立させる", async () => {
		const target = await insertHabit();
		await insertRecord(target.id, "2026-07-10");
		const [homeResult, archiveResult] = await runHabitOperationsInOrder(
			target.id,
			() => getHomeData({ user: owner, now }),
			() => archiveHabit({ user: owner, habitId: target.id, now }),
		);

		expect(homeResult).toMatchObject({
			status: "fulfilled",
			value: { habits: [{ id: target.id }] },
		});
		if (homeResult.status === "fulfilled") {
			expect(getActivity(homeResult.value, "2026-07-10").completionRate).toBe(
				1,
			);
		}
		expect(archiveResult).toMatchObject({ status: "fulfilled" });
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored.archivedAt).toEqual(now);
	});

	it("update先行時は更新後のnameとemojiをhomeへ反映する", async () => {
		const target = await insertHabit({ currentStreak: 0 });
		const [updateResult, homeResult] = await runHabitOperationsInOrder(
			target.id,
			() =>
				updateHabit({
					user: owner,
					habitId: target.id,
					body: { name: "更新後", emoji: "🌱" },
					now,
				}),
			() => getHomeData({ user: owner, now }),
		);

		expect(updateResult).toMatchObject({ status: "fulfilled" });
		expect(homeResult).toMatchObject({
			status: "fulfilled",
			value: { habits: [{ name: "更新後", emoji: "🌱" }] },
		});
	});

	it("update待機中にname順が逆転しても更新後の値で再ソートする", async () => {
		const target = await insertHabit({ name: "a", currentStreak: 0 });
		await insertHabit({ name: "b", currentStreak: 0 });
		const [updateResult, homeResult] = await runHabitOperationsInOrder(
			target.id,
			() =>
				updateHabit({
					user: owner,
					habitId: target.id,
					body: { name: "z", emoji: "🌱" },
					now,
				}),
			() => getHomeData({ user: owner, now }),
		);

		expect(updateResult).toMatchObject({ status: "fulfilled" });
		expect(homeResult).toMatchObject({ status: "fulfilled" });
		if (homeResult.status === "fulfilled") {
			expect(homeResult.value.habits.map((item) => item.name)).toEqual([
				"b",
				"z",
			]);
		}
	});

	it("home先行時は固定したnameを返した後にupdateを成立させる", async () => {
		const target = await insertHabit({ currentStreak: 0 });
		const [homeResult, updateResult] = await runHabitOperationsInOrder(
			target.id,
			() => getHomeData({ user: owner, now }),
			() =>
				updateHabit({
					user: owner,
					habitId: target.id,
					body: { name: "更新後", emoji: "🌱" },
					now,
				}),
		);

		expect(homeResult).toMatchObject({
			status: "fulfilled",
			value: { habits: [{ name: "読書", emoji: "📚" }] },
		});
		expect(updateResult).toMatchObject({ status: "fulfilled" });
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toMatchObject({ name: "更新後", emoji: "🌱" });
	});
});
