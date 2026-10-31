import { and, count, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/index.server";
import { dailyRecord, habit, user } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { ApiError } from "~/lib/api/errors";
import { completeHabit } from "./habits.service.server";

const baseNow = new Date("2026-07-12T03:00:00.000Z");
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
			createdAt: baseNow,
			updatedAt: baseNow,
			...values,
		})
		.returning();

	if (!created) {
		throw new Error("テスト用habitを作成できませんでした。");
	}
	return created;
}

function getErrorMessages(error: unknown): string[] {
	const messages: string[] = [];
	const visited = new Set<object>();
	let current = error;
	while (typeof current === "object" && current !== null) {
		if (visited.has(current)) {
			break;
		}
		visited.add(current);
		const candidate = current as { message?: unknown; cause?: unknown };
		if (typeof candidate.message === "string") {
			messages.push(candidate.message);
		}
		current = candidate.cause;
	}
	return messages;
}

describe("completeHabit PostgreSQL integration", () => {
	beforeEach(async (context) => {
		owner = {
			id: `complete-habit-${context.task.id}-${crypto.randomUUID()}`,
		} as AuthenticatedUser;
		await db.insert(user).values({
			id: owner.id,
			name: owner.id,
			email: `${owner.id}@example.test`,
			emailVerified: true,
			createdAt: baseNow,
			updatedAt: baseNow,
		});
	});

	afterEach(async () => {
		await db.delete(habit).where(eq(habit.userId, owner.id));
		await db.delete(user).where(eq(user.id, owner.id));
	});

	it("当日のdaily_recordを作成し、streakとhabit summaryを更新する", async () => {
		const target = await insertHabit();

		const result = await completeHabit({
			user: owner,
			habitId: target.id,
			now: baseNow,
		});

		expect(result).toEqual({
			dailyRecord: {
				id: expect.any(String),
				habitId: target.id,
				date: "2026-07-12",
				completedAt: "2026-07-12T12:00:00+09:00",
			},
			habit: {
				id: target.id,
				name: "読書",
				emoji: "📚",
				currentStreak: 1,
				maxStreak: 1,
				isCompletedToday: true,
			},
		});

		const [recordCount] = await db
			.select({ value: count() })
			.from(dailyRecord)
			.where(eq(dailyRecord.habitId, target.id));
		expect(recordCount.value).toBe(1);
	});

	it("昨日の達成からcurrentStreakを継続し、maxStreakを維持する", async () => {
		const target = await insertHabit({ currentStreak: 4, maxStreak: 7 });
		await db.insert(dailyRecord).values({
			habitId: target.id,
			date: "2026-07-11",
			completedAt: new Date("2026-07-11T03:00:00.000Z"),
		});

		const result = await completeHabit({
			user: owner,
			habitId: target.id,
			now: baseNow,
		});

		expect(result.habit.currentStreak).toBe(5);
		expect(result.habit.maxStreak).toBe(7);
	});

	it("昨日より前の達成からstreakを1で再開し、maxStreakを更新する", async () => {
		const target = await insertHabit({ currentStreak: 8, maxStreak: 8 });
		await db.insert(dailyRecord).values({
			habitId: target.id,
			date: "2026-07-10",
			completedAt: new Date("2026-07-10T03:00:00.000Z"),
		});

		const result = await completeHabit({
			user: owner,
			habitId: target.id,
			now: baseNow,
		});

		expect(result.habit.currentStreak).toBe(1);
		expect(result.habit.maxStreak).toBe(8);
	});

	it("23:59:59 JSTと00:00 JSTを別の日付として記録する", async () => {
		const target = await insertHabit();
		const justBeforeMidnight = new Date("2026-07-11T14:59:59.999Z");
		const midnight = new Date("2026-07-11T15:00:00.000Z");

		const first = await completeHabit({
			user: owner,
			habitId: target.id,
			now: justBeforeMidnight,
		});
		const second = await completeHabit({
			user: owner,
			habitId: target.id,
			now: midnight,
		});

		expect(first.dailyRecord.date).toBe("2026-07-11");
		expect(second.dailyRecord.date).toBe("2026-07-12");
		expect(second.habit.currentStreak).toBe(2);
	});

	it("同日の二重達成を拒否する", async () => {
		const target = await insertHabit();
		await completeHabit({ user: owner, habitId: target.id, now: baseNow });

		await expect(
			completeHabit({ user: owner, habitId: target.id, now: baseNow }),
		).rejects.toMatchObject({
			code: "HABIT_ALREADY_COMPLETED_TODAY",
			status: 409,
		});
	});

	it("daily_record INSERT後のhabit更新失敗時にtransaction全体をrollbackする", async () => {
		const target = await insertHabit({ currentStreak: 4, maxStreak: 7 });
		await db.insert(dailyRecord).values({
			habitId: target.id,
			date: "2026-07-11",
			completedAt: new Date("2026-07-11T03:00:00.000Z"),
		});

		try {
			await db.execute(sql`
				drop trigger if exists test_fail_complete_habit_update on "habit"
			`);
			await db.execute(sql`
				create or replace function test_fail_complete_habit_update()
				returns trigger
				language plpgsql
				as $trigger$
				begin
					raise exception 'forced habit update failure';
				end;
				$trigger$
			`);
			await db.execute(sql`
				create trigger test_fail_complete_habit_update
				before update on "habit"
				for each row execute function test_fail_complete_habit_update()
			`);

			let failure: unknown;
			try {
				await completeHabit({ user: owner, habitId: target.id, now: baseNow });
			} catch (error) {
				failure = error;
			}
			expect(getErrorMessages(failure)).toContain(
				"forced habit update failure",
			);
		} finally {
			await db.execute(sql`
				drop trigger if exists test_fail_complete_habit_update on "habit"
			`);
			await db.execute(sql`
				drop function if exists test_fail_complete_habit_update()
			`);
		}

		const records = await db
			.select({ date: dailyRecord.date })
			.from(dailyRecord)
			.where(eq(dailyRecord.habitId, target.id));
		expect(records).toEqual([{ date: "2026-07-11" }]);

		const [storedHabit] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(storedHabit).toMatchObject({
			currentStreak: 4,
			maxStreak: 7,
			updatedAt: baseNow,
		});
	});

	it("アーカイブ済みhabitを拒否する", async () => {
		const target = await insertHabit({ archivedAt: baseNow });

		await expect(
			completeHabit({ user: owner, habitId: target.id, now: baseNow }),
		).rejects.toMatchObject({ code: "HABIT_ARCHIVED", status: 409 });

		const [recordCount] = await db
			.select({ value: count() })
			.from(dailyRecord)
			.where(eq(dailyRecord.habitId, target.id));
		expect(recordCount.value).toBe(0);
	});

	it("存在しないhabitと他ユーザーのhabitをHABIT_NOT_FOUNDとして扱う", async () => {
		const otherUser = {
			id: `other-complete-habit-${crypto.randomUUID()}`,
		} as AuthenticatedUser;
		await db.insert(user).values({
			id: otherUser.id,
			name: otherUser.id,
			email: `${otherUser.id}@example.test`,
			emailVerified: true,
			createdAt: baseNow,
			updatedAt: baseNow,
		});
		const otherHabit = await db
			.insert(habit)
			.values({
				userId: otherUser.id,
				name: "他ユーザーの習慣",
				emoji: "",
				createdAt: baseNow,
				updatedAt: baseNow,
			})
			.returning({ id: habit.id });

		await expect(
			completeHabit({
				user: owner,
				habitId: otherHabit[0].id,
				now: baseNow,
			}),
		).rejects.toMatchObject({ code: "HABIT_NOT_FOUND", status: 404 });
		await expect(
			completeHabit({
				user: owner,
				habitId: "not-a-uuid",
				now: baseNow,
			}),
		).rejects.toBeInstanceOf(ApiError);

		await db.delete(habit).where(eq(habit.userId, otherUser.id));
		await db.delete(user).where(eq(user.id, otherUser.id));
	});

	it("同じhabitへの並行completeをhabit行ロックで直列化する", async () => {
		const target = await insertHabit();
		const results = await Promise.allSettled([
			completeHabit({ user: owner, habitId: target.id, now: baseNow }),
			completeHabit({ user: owner, habitId: target.id, now: baseNow }),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect((rejected as PromiseRejectedResult).reason).toMatchObject({
			code: "HABIT_ALREADY_COMPLETED_TODAY",
			status: 409,
		});

		const [recordCount] = await db
			.select({ value: count() })
			.from(dailyRecord)
			.where(
				and(
					eq(dailyRecord.habitId, target.id),
					eq(dailyRecord.date, "2026-07-12"),
				),
			);
		expect(recordCount.value).toBe(1);
	});
});
