import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "~/db/index.server";
import { dailyRecord, habit, user as userTable } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { getJstDateContext, toJstDateTimeString } from "~/lib/api/date";
import { ApiError } from "~/lib/api/errors";
import {
	createHabitRequestSchema,
	habitIdSchema,
	parseApiInput,
	updateHabitRequestSchema,
} from "./habits.contract";

export type HabitResponse = {
	id: string;
	name: string;
	emoji: string;
	currentStreak: number;
	maxStreak: number;
	createdAt: string;
	archivedAt: string | null;
};

export type CreateHabitInput = {
	user: AuthenticatedUser;
	body: unknown;
	now?: Date;
};

export type UpdateHabitInput = {
	user: AuthenticatedUser;
	habitId: string;
	body: unknown;
	now?: Date;
};

export type HabitMutationInput = {
	user: AuthenticatedUser;
	habitId: string;
	now?: Date;
};

type HabitRow = typeof habit.$inferSelect;

function toHabitResponse(row: HabitRow): HabitResponse {
	return {
		id: row.id,
		name: row.name,
		emoji: row.emoji,
		currentStreak: row.currentStreak,
		maxStreak: row.maxStreak,
		createdAt: toJstDateTimeString(row.createdAt),
		archivedAt: row.archivedAt ? toJstDateTimeString(row.archivedAt) : null,
	};
}

function validateHabitId(habitId: string): string {
	return parseApiInput(habitIdSchema, habitId);
}

function isDailyRecordUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505" &&
		"constraint_name" in error &&
		error.constraint_name === "habit_date_unique"
	);
}

export async function createHabit(
	input: CreateHabitInput,
): Promise<HabitResponse> {
	const request = parseApiInput(createHabitRequestSchema, input.body);
	const now = input.now ?? new Date();

	return db.transaction(async (tx) => {
		// ユーザー行を mutex として利用し、同一ユーザーの上限判定と INSERT を直列化する。
		await tx
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.id, input.user.id))
			.for("update");

		const [counts] = await tx
			.select({
				total: sql<number>`count(*)::int`,
				active: sql<number>`count(*) filter (where ${habit.archivedAt} is null)::int`,
			})
			.from(habit)
			.where(eq(habit.userId, input.user.id));

		if ((counts?.active ?? 0) >= 10 || (counts?.total ?? 0) >= 1000) {
			throw new ApiError("HABIT_LIMIT_EXCEEDED");
		}

		const [created] = await tx
			.insert(habit)
			.values({
				userId: input.user.id,
				name: request.name,
				emoji: request.emoji,
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		return toHabitResponse(created);
	});
}

export async function updateHabit(
	input: UpdateHabitInput,
): Promise<HabitResponse> {
	const habitId = validateHabitId(input.habitId);
	const request = parseApiInput(updateHabitRequestSchema, input.body);
	const now = input.now ?? new Date();

	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(habit)
			.where(and(eq(habit.id, habitId), eq(habit.userId, input.user.id)))
			.for("update");
		if (!current) throw new ApiError("HABIT_NOT_FOUND");
		if (current.archivedAt) throw new ApiError("HABIT_ARCHIVED");

		const [updated] = await tx
			.update(habit)
			.set({ ...request, updatedAt: now })
			.where(eq(habit.id, current.id))
			.returning();
		return toHabitResponse(updated);
	});
}

export async function archiveHabit(
	input: HabitMutationInput,
): Promise<HabitResponse> {
	const habitId = validateHabitId(input.habitId);
	const now = input.now ?? new Date();

	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(habit)
			.where(and(eq(habit.id, habitId), eq(habit.userId, input.user.id)))
			.for("update");
		if (!current) throw new ApiError("HABIT_NOT_FOUND");
		if (current.archivedAt) return toHabitResponse(current);

		const [archived] = await tx
			.update(habit)
			.set({ archivedAt: now, updatedAt: now })
			.where(eq(habit.id, current.id))
			.returning();
		return toHabitResponse(archived);
	});
}

export async function completeHabit(input: HabitMutationInput) {
	const habitId = validateHabitId(input.habitId);
	const now = input.now ?? new Date();
	const { today, yesterday } = getJstDateContext(now);

	try {
		return await db.transaction(async (tx) => {
			const [current] = await tx
				.select()
				.from(habit)
				.where(and(eq(habit.id, habitId), eq(habit.userId, input.user.id)))
				.for("update");
			if (!current) throw new ApiError("HABIT_NOT_FOUND");
			if (current.archivedAt) throw new ApiError("HABIT_ARCHIVED");

			const [latest] = await tx
				.select({ date: dailyRecord.date })
				.from(dailyRecord)
				.where(eq(dailyRecord.habitId, current.id))
				.orderBy(desc(dailyRecord.date))
				.limit(1);
			if (latest?.date === today)
				throw new ApiError("HABIT_ALREADY_COMPLETED_TODAY");

			const currentStreak =
				latest?.date === yesterday ? current.currentStreak + 1 : 1;
			const maxStreak = Math.max(current.maxStreak, currentStreak);
			const [createdRecord] = await tx
				.insert(dailyRecord)
				.values({ habitId: current.id, date: today, completedAt: now })
				.returning();
			const [updatedHabit] = await tx
				.update(habit)
				.set({ currentStreak, maxStreak, updatedAt: now })
				.where(and(eq(habit.id, current.id), isNull(habit.archivedAt)))
				.returning();

			return {
				dailyRecord: {
					id: createdRecord.id,
					habitId: createdRecord.habitId,
					date: createdRecord.date,
					completedAt: toJstDateTimeString(createdRecord.completedAt),
				},
				habit: toHabitResponse(updatedHabit),
			};
		});
	} catch (error) {
		if (isDailyRecordUniqueViolation(error)) {
			throw new ApiError("HABIT_ALREADY_COMPLETED_TODAY", undefined, {
				cause: error,
			});
		}
		throw error;
	}
}
