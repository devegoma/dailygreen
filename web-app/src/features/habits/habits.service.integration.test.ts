import { and, count, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/index.server";
import { habit, user } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { ApiError } from "~/lib/api/errors";
import { createHabit } from "./habits.service.server";

const now = new Date("2026-07-12T03:00:00.000Z");
let owner: AuthenticatedUser;

async function insertHabits(
	amount: number,
	options: { archived?: boolean } = {},
) {
	const archivedAt = options.archived ? now : null;
	await db.insert(habit).values(
		Array.from({ length: amount }, (_, index) => ({
			userId: owner.id,
			name: `習慣${index}`,
			emoji: "",
			archivedAt,
			createdAt: now,
			updatedAt: now,
		})),
	);
}

describe("createHabit PostgreSQL integration", () => {
	beforeEach(async (context) => {
		owner = {
			id: `create-habit-${context.task.id}-${crypto.randomUUID()}`,
		} as AuthenticatedUser;
		await db.insert(user).values({
			id: owner.id,
			name: owner.id,
			email: `${owner.id}@example.test`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});
	});

	afterEach(async () => {
		await db.delete(habit).where(eq(habit.userId, owner.id));
		await db.delete(user).where(eq(user.id, owner.id));
	});

	it("同名を含む習慣を作成し、仕様どおりの初期値を返す", async () => {
		const first = await createHabit({
			user: owner,
			body: { name: "  読書  ", emoji: "📚" },
			now,
		});
		const second = await createHabit({
			user: owner,
			body: { name: "読書" },
			now,
		});

		expect(first).toEqual({
			id: expect.any(String),
			name: "読書",
			emoji: "📚",
			currentStreak: 0,
			maxStreak: 0,
			createdAt: "2026-07-12T12:00:00+09:00",
			archivedAt: null,
		});
		expect(second).toMatchObject({ name: "読書", emoji: "" });
		expect(second.id).not.toBe(first.id);
	});

	it("active habitが10件に達している場合は作成しない", async () => {
		await insertHabits(10);

		await expect(
			createHabit({ user: owner, body: { name: "上限超過" }, now }),
		).rejects.toMatchObject({
			code: "HABIT_LIMIT_EXCEEDED",
			status: 409,
		});
	});

	it("アーカイブ済みを含むhabit総数が1000件に達している場合は作成しない", async () => {
		await insertHabits(1000, { archived: true });

		await expect(
			createHabit({ user: owner, body: { name: "上限超過" }, now }),
		).rejects.toMatchObject({
			code: "HABIT_LIMIT_EXCEEDED",
			status: 409,
		});
	});

	it("同一ユーザーの並行作成を直列化してactive上限を超えない", async () => {
		await insertHabits(9);

		const results = await Promise.allSettled([
			createHabit({ user: owner, body: { name: "並行1" }, now }),
			createHabit({ user: owner, body: { name: "並行2" }, now }),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
		expect((rejected as PromiseRejectedResult).reason).toMatchObject({
			code: "HABIT_LIMIT_EXCEEDED",
		});

		const [activeCount] = await db
			.select({ value: count() })
			.from(habit)
			.where(and(eq(habit.userId, owner.id), isNull(habit.archivedAt)));
		expect(activeCount.value).toBe(10);
	});
});
