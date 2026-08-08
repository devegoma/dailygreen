import { count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/index.server";
import { dailyRecord, habit, user } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { completeHabit, updateHabit } from "./habits.service.server";

const createdAt = new Date("2026-07-10T03:00:00.000Z");
const initialUpdatedAt = new Date("2026-07-11T03:00:00.000Z");
const updateNow = new Date("2026-07-12T03:00:00.000Z");
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

describe("updateHabit PostgreSQL integration", () => {
	beforeEach(async (context) => {
		owner = {
			id: `update-habit-${context.task.id}-${crypto.randomUUID()}`,
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

	it("nameだけを更新し、streak・作成日時・過去の達成記録を変更しない", async () => {
		const target = await insertHabit();
		const [record] = await db
			.insert(dailyRecord)
			.values({
				habitId: target.id,
				date: "2026-07-11",
				completedAt: initialUpdatedAt,
			})
			.returning();

		const result = await updateHabit({
			user: owner,
			habitId: target.id,
			body: { name: "  毎日読書する  " },
			now: updateNow,
		});

		expect(result).toEqual({
			id: target.id,
			name: "毎日読書する",
			emoji: "📚",
			currentStreak: 4,
			maxStreak: 8,
			createdAt: "2026-07-10T12:00:00+09:00",
			archivedAt: null,
		});

		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toMatchObject({
			name: "毎日読書する",
			emoji: "📚",
			currentStreak: 4,
			maxStreak: 8,
			createdAt,
			archivedAt: null,
			updatedAt: updateNow,
		});
		expect(
			await db
				.select()
				.from(dailyRecord)
				.where(eq(dailyRecord.habitId, target.id)),
		).toEqual([record]);
	});

	it("emojiだけを更新し、空文字で未設定へ戻せる", async () => {
		const target = await insertHabit();

		const changed = await updateHabit({
			user: owner,
			habitId: target.id,
			body: { emoji: "📖" },
			now: updateNow,
		});
		expect(changed).toMatchObject({ name: "読書", emoji: "📖" });

		const cleared = await updateHabit({
			user: owner,
			habitId: target.id,
			body: { emoji: "" },
			now: updateNow,
		});
		expect(cleared).toMatchObject({ name: "読書", emoji: "" });
	});

	it("nameとemojiを同時に更新する", async () => {
		const target = await insertHabit();

		const result = await updateHabit({
			user: owner,
			habitId: target.id,
			body: { name: "運動", emoji: "🏃" },
			now: updateNow,
		});

		expect(result).toMatchObject({ name: "運動", emoji: "🏃" });
	});

	it("値が変わらない更新も成功し、updatedAtだけを更新する", async () => {
		const target = await insertHabit();

		const result = await updateHabit({
			user: owner,
			habitId: target.id,
			body: { name: "読書", emoji: "📚" },
			now: updateNow,
		});

		expect(result).toMatchObject({ name: "読書", emoji: "📚" });
		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toEqual({ ...target, updatedAt: updateNow });
	});

	it("アーカイブ済みhabitを拒否し、DB状態を変更しない", async () => {
		const archivedAt = new Date("2026-07-11T12:00:00.000Z");
		const target = await insertHabit({ archivedAt });

		await expect(
			updateHabit({
				user: owner,
				habitId: target.id,
				body: { name: "変更後" },
				now: updateNow,
			}),
		).rejects.toMatchObject({ code: "HABIT_ARCHIVED", status: 409 });

		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toEqual(target);
	});

	it("存在しないhabitと他ユーザーのhabitをHABIT_NOT_FOUNDとして扱う", async () => {
		const otherUserId = `other-update-habit-${crypto.randomUUID()}`;
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
			updateHabit({
				user: owner,
				habitId: otherHabit.id,
				body: { name: "変更後" },
				now: updateNow,
			}),
		).rejects.toMatchObject({ code: "HABIT_NOT_FOUND", status: 404 });
		await expect(
			updateHabit({
				user: owner,
				habitId: crypto.randomUUID(),
				body: { name: "変更後" },
				now: updateNow,
			}),
		).rejects.toMatchObject({ code: "HABIT_NOT_FOUND", status: 404 });
		await expect(
			updateHabit({
				user: owner,
				habitId: "not-a-uuid",
				body: { name: "変更後" },
				now: updateNow,
			}),
		).rejects.toMatchObject({ code: "HABIT_NOT_FOUND", status: 404 });

		await db.delete(habit).where(eq(habit.userId, otherUserId));
		await db.delete(user).where(eq(user.id, otherUserId));
	});

	it("completeとの競合をhabit行ロックで直列化し、両方の更新を保持する", async () => {
		const target = await insertHabit({ currentStreak: 0, maxStreak: 0 });

		const [updateResult, completeResult] = await Promise.all([
			updateHabit({
				user: owner,
				habitId: target.id,
				body: { name: "更新後", emoji: "🌱" },
				now: updateNow,
			}),
			completeHabit({ user: owner, habitId: target.id, now: updateNow }),
		]);

		const updateSawComplete = updateResult.currentStreak === 1;
		const completeSawUpdate = completeResult.habit.name === "更新後";
		expect(Number(updateSawComplete) + Number(completeSawUpdate)).toBe(1);

		const [stored] = await db
			.select()
			.from(habit)
			.where(eq(habit.id, target.id));
		expect(stored).toMatchObject({
			name: "更新後",
			emoji: "🌱",
			currentStreak: 1,
			maxStreak: 1,
		});
		const [recordCount] = await db
			.select({ value: count() })
			.from(dailyRecord)
			.where(eq(dailyRecord.habitId, target.id));
		expect(recordCount.value).toBe(1);
	});
});
