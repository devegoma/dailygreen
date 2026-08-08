import { count, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/index.server";
import { dailyRecord, habit, user } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import {
	archiveHabit,
	completeHabit,
	updateHabit,
} from "./habits.service.server";

const createdAt = new Date("2026-07-10T03:00:00.000Z");
const initialUpdatedAt = new Date("2026-07-11T03:00:00.000Z");
const operationNow = new Date("2026-07-12T03:00:00.000Z");
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
			currentStreak: 4,
			maxStreak: 8,
			createdAt,
			updatedAt: initialUpdatedAt,
			...values,
		})
		.returning();

	if (!created) {
		throw new Error("テスト用habitを作成できませんでした。");
	}
	return created;
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

async function runHabitOperationsInOrder(
	habitId: string,
	first: () => Promise<unknown>,
	second: () => Promise<unknown>,
): Promise<[PromiseSettledResult<unknown>, PromiseSettledResult<unknown>]> {
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
	let firstPromise: Promise<unknown> | undefined;
	let secondPromise: Promise<unknown> | undefined;
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

describe("archiveHabit PostgreSQL integration", () => {
	beforeEach(async (context) => {
		owner = {
			id: `archive-habit-${context.task.id}-${crypto.randomUUID()}`,
		} as AuthenticatedUser;
		await db.insert(user).values({
			id: owner.id,
			name: owner.id,
			email: `${owner.id}@example.test`,
			emailVerified: true,
			createdAt,
			updatedAt: createdAt,
		});
	});

	afterEach(async () => {
		await db.delete(habit).where(eq(habit.userId, owner.id));
		await db.delete(user).where(eq(user.id, owner.id));
	});

	it("habitを削除せずアーカイブし、関連情報と過去の達成記録を変更しない", async () => {
		const target = await insertHabit();
		const [record] = await db
			.insert(dailyRecord)
			.values({
				habitId: target.id,
				date: "2026-07-11",
				completedAt: initialUpdatedAt,
			})
			.returning();

		const result = await archiveHabit({
			user: owner,
			habitId: target.id,
			now: operationNow,
		});

		expect(result).toEqual({
			id: target.id,
			name: "読書",
			emoji: "📚",
			currentStreak: 4,
			maxStreak: 8,
			createdAt: "2026-07-10T12:00:00+09:00",
			archivedAt: "2026-07-12T12:00:00+09:00",
		});

		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toEqual({
			...target,
			archivedAt: operationNow,
			updatedAt: operationNow,
		});
		expect(
			await db
				.select()
				.from(dailyRecord)
				.where(eq(dailyRecord.habitId, target.id)),
		).toEqual([record]);
	});

	it("アーカイブ済みhabitのarchivedAtとupdatedAtを変更せず冪等に返す", async () => {
		const archivedAt = new Date("2026-07-11T12:34:56.789Z");
		const target = await insertHabit({ archivedAt });

		const result = await archiveHabit({
			user: owner,
			habitId: target.id,
			now: operationNow,
		});

		expect(result.archivedAt).toBe("2026-07-11T21:34:56+09:00");
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toEqual(target);
	});

	it("存在しないhabitと他ユーザーのhabitをHABIT_NOT_FOUNDとして扱う", async () => {
		const otherUserId = `other-archive-habit-${crypto.randomUUID()}`;
		await db.insert(user).values({
			id: otherUserId,
			name: otherUserId,
			email: `${otherUserId}@example.test`,
			emailVerified: true,
			createdAt,
			updatedAt: createdAt,
		});
		const [otherHabit] = await db
			.insert(habit)
			.values({
				userId: otherUserId,
				name: "他ユーザーの習慣",
				emoji: "",
				createdAt,
				updatedAt: createdAt,
			})
			.returning();

		await expect(
			archiveHabit({ user: owner, habitId: otherHabit.id, now: operationNow }),
		).rejects.toMatchObject({ code: "HABIT_NOT_FOUND", status: 404 });
		await expect(
			archiveHabit({
				user: owner,
				habitId: crypto.randomUUID(),
				now: operationNow,
			}),
		).rejects.toMatchObject({ code: "HABIT_NOT_FOUND", status: 404 });
		await expect(
			archiveHabit({ user: owner, habitId: "not-a-uuid", now: operationNow }),
		).rejects.toMatchObject({ code: "HABIT_NOT_FOUND", status: 404 });

		await db.delete(habit).where(eq(habit.userId, otherUserId));
		await db.delete(user).where(eq(user.id, otherUserId));
	});

	it("updateが先行した場合は更新後のnameとemojiを保持してアーカイブする", async () => {
		const target = await insertHabit();
		const [updateResult, archiveResult] = await runHabitOperationsInOrder(
			target.id,
			() =>
				updateHabit({
					user: owner,
					habitId: target.id,
					body: { name: "更新後", emoji: "🌱" },
					now: operationNow,
				}),
			() =>
				archiveHabit({ user: owner, habitId: target.id, now: operationNow }),
		);

		expect(updateResult).toMatchObject({ status: "fulfilled" });
		expect(archiveResult).toMatchObject({
			status: "fulfilled",
			value: { name: "更新後", emoji: "🌱" },
		});
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toMatchObject({
			name: "更新後",
			emoji: "🌱",
			archivedAt: operationNow,
		});
	});

	it("archiveが先行した場合は後続updateを拒否して表示情報を変更しない", async () => {
		const target = await insertHabit();
		const [archiveResult, updateResult] = await runHabitOperationsInOrder(
			target.id,
			() =>
				archiveHabit({ user: owner, habitId: target.id, now: operationNow }),
			() =>
				updateHabit({
					user: owner,
					habitId: target.id,
					body: { name: "更新後", emoji: "🌱" },
					now: operationNow,
				}),
		);

		expect(archiveResult).toMatchObject({ status: "fulfilled" });
		expect(updateResult).toMatchObject({
			status: "rejected",
			reason: { code: "HABIT_ARCHIVED", status: 409 },
		});
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toMatchObject({
			name: "読書",
			emoji: "📚",
			archivedAt: operationNow,
		});
	});

	it("completeが先行した場合は達成記録とstreak更新後にアーカイブする", async () => {
		const target = await insertHabit({ currentStreak: 0, maxStreak: 0 });
		const [completeResult, archiveResult] = await runHabitOperationsInOrder(
			target.id,
			() =>
				completeHabit({ user: owner, habitId: target.id, now: operationNow }),
			() =>
				archiveHabit({ user: owner, habitId: target.id, now: operationNow }),
		);

		expect(completeResult).toMatchObject({ status: "fulfilled" });
		expect(archiveResult).toMatchObject({
			status: "fulfilled",
			value: { currentStreak: 1, maxStreak: 1 },
		});
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toMatchObject({
			currentStreak: 1,
			maxStreak: 1,
			archivedAt: operationNow,
		});
		const [recordCount] = await db
			.select({ value: count() })
			.from(dailyRecord)
			.where(eq(dailyRecord.habitId, target.id));
		expect(recordCount.value).toBe(1);
	});

	it("archiveが先行した場合は後続completeを拒否して部分更新を残さない", async () => {
		const target = await insertHabit({ currentStreak: 0, maxStreak: 0 });
		const [archiveResult, completeResult] = await runHabitOperationsInOrder(
			target.id,
			() =>
				archiveHabit({ user: owner, habitId: target.id, now: operationNow }),
			() =>
				completeHabit({ user: owner, habitId: target.id, now: operationNow }),
		);

		expect(archiveResult).toMatchObject({ status: "fulfilled" });
		expect(completeResult).toMatchObject({
			status: "rejected",
			reason: { code: "HABIT_ARCHIVED", status: 409 },
		});
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toMatchObject({
			currentStreak: 0,
			maxStreak: 0,
			archivedAt: operationNow,
		});
		const [recordCount] = await db
			.select({ value: count() })
			.from(dailyRecord)
			.where(eq(dailyRecord.habitId, target.id));
		expect(recordCount.value).toBe(0);
	});
});
