import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/db/index.server";
import { dailyRecord, habit, user } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { ApiError } from "~/lib/api/errors";
import {
	completeHabit,
	createHabit,
	updateHabit,
} from "./habits.service.server";

const now = new Date("2026-07-12T03:00:00.000Z");
const owner = { id: "integration-owner" } as AuthenticatedUser;
const anotherUser = { id: "integration-another" } as AuthenticatedUser;

async function insertUser(id: string) {
	await db.insert(user).values({
		id,
		name: id,
		email: `${id}@example.test`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
}

describe("habits service PostgreSQL integration", () => {
	beforeEach(async () => {
		await insertUser(owner.id);
		await insertUser(anotherUser.id);
	});

	afterEach(async () => {
		await db.delete(user).where(eq(user.id, owner.id));
		await db.delete(user).where(eq(user.id, anotherUser.id));
	});

	it("所有者だけがactive habitを更新できupdatedAtも更新する", async () => {
		const created = await createHabit({
			user: owner,
			body: { name: "読書", emoji: "📚" },
			now,
		});
		await expect(
			updateHabit({
				user: anotherUser,
				habitId: created.id,
				body: { name: "侵入" },
				now,
			}),
		).rejects.toMatchObject({ code: "HABIT_NOT_FOUND" });

		const updatedAt = new Date(now.getTime() + 1_000);
		const updated = await updateHabit({
			user: owner,
			habitId: created.id,
			body: { name: "  毎日読書  ", emoji: "📖" },
			now: updatedAt,
		});
		expect(updated).toMatchObject({ name: "毎日読書", emoji: "📖" });
		const [row] = await db.select().from(habit).where(eq(habit.id, created.id));
		expect(row.updatedAt).toEqual(updatedAt);
	});

	it("同じ習慣の二重達成を直列化し記録を1件だけ作る", async () => {
		const created = await createHabit({
			user: owner,
			body: { name: "散歩" },
			now,
		});
		const results = await Promise.allSettled([
			completeHabit({ user: owner, habitId: created.id, now }),
			completeHabit({ user: owner, habitId: created.id, now }),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
		expect((rejected as PromiseRejectedResult).reason.code).toBe(
			"HABIT_ALREADY_COMPLETED_TODAY",
		);
		expect(
			await db
				.select()
				.from(dailyRecord)
				.where(eq(dailyRecord.habitId, created.id)),
		).toHaveLength(1);
	});
});
