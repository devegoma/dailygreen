import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "~/db/index.server";
import { dailyRecord, habit, user as userTable } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { getJstDateContext, toJstDateTimeString } from "~/lib/api/date";
import { ApiError } from "~/lib/api/errors";
import {
	parseCreateHabitRequest,
	parseUpdateHabitRequest,
} from "./habits.contract";

const ACTIVE_HABIT_LIMIT = 10;
const TOTAL_HABIT_LIMIT = 1000;

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

export type HabitMutationInput = {
	user: AuthenticatedUser;
	habitId: string;
	now?: Date;
};

export type UpdateHabitInput = HabitMutationInput & {
	body: unknown;
};

type HabitRow = typeof habit.$inferSelect;
type HabitTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type HabitSummary = Pick<
	HabitRow,
	"id" | "name" | "emoji" | "currentStreak" | "maxStreak"
> & {
	isCompletedToday: boolean;
};

export type CompleteHabitResponse = {
	dailyRecord: {
		id: string;
		habitId: string;
		date: string;
		completedAt: string;
	};
	habit: HabitSummary;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function toHabitSummary(row: HabitRow): HabitSummary {
	return {
		id: row.id,
		name: row.name,
		emoji: row.emoji,
		currentStreak: row.currentStreak,
		maxStreak: row.maxStreak,
		isCompletedToday: true,
	};
}

async function lockHabit(
	tx: HabitTransaction,
	userId: string,
	habitId: string,
): Promise<HabitRow> {
	if (!uuidPattern.test(habitId)) {
		throw new ApiError("HABIT_NOT_FOUND");
	}

	const [lockedHabit] = await tx
		.select()
		.from(habit)
		.where(and(eq(habit.id, habitId), eq(habit.userId, userId)))
		.for("update");

	if (!lockedHabit) {
		throw new ApiError("HABIT_NOT_FOUND");
	}

	return lockedHabit;
}

function isDailyRecordUniqueViolation(error: unknown): boolean {
	const visited = new Set<object>();
	let current: unknown = error;

	while (typeof current === "object" && current !== null) {
		if (visited.has(current)) {
			return false;
		}
		visited.add(current);

		const databaseError = current as {
			code?: unknown;
			constraint_name?: unknown;
			cause?: unknown;
		};
		if (
			databaseError.code === "23505" &&
			databaseError.constraint_name === "habit_date_unique"
		) {
			return true;
		}
		current = databaseError.cause;
	}

	return false;
}

export async function createHabit(
	input: CreateHabitInput,
): Promise<HabitResponse> {
	const request = parseCreateHabitRequest(input.body);
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

		if (
			(counts?.active ?? 0) >= ACTIVE_HABIT_LIMIT ||
			(counts?.total ?? 0) >= TOTAL_HABIT_LIMIT
		) {
			throw new ApiError("HABIT_LIMIT_EXCEEDED");
		}

		const [created] = await tx
			.insert(habit)
			.values({
				userId: input.user.id,
				name: request.name,
				emoji: request.emoji,
				currentStreak: 0,
				maxStreak: 0,
				archivedAt: null,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		if (!created) {
			throw new Error("習慣の作成結果を取得できませんでした。");
		}
		return toHabitResponse(created);
	});
}

export async function archiveHabit(
	input: HabitMutationInput,
): Promise<HabitResponse> {
	const now = input.now ?? new Date();

	return db.transaction(async (tx) => {
		const lockedHabit = await lockHabit(tx, input.user.id, input.habitId);
		if (lockedHabit.archivedAt !== null) {
			return toHabitResponse(lockedHabit);
		}

		const [archivedHabit] = await tx
			.update(habit)
			.set({ archivedAt: now, updatedAt: now })
			.where(eq(habit.id, lockedHabit.id))
			.returning();

		if (!archivedHabit) {
			throw new Error("習慣のアーカイブ結果を取得できませんでした。");
		}

		return toHabitResponse(archivedHabit);
	});
}

export async function updateHabit(
	input: UpdateHabitInput,
): Promise<HabitResponse> {
	const request = parseUpdateHabitRequest(input.body);
	const now = input.now ?? new Date();

	return db.transaction(async (tx) => {
		const lockedHabit = await lockHabit(tx, input.user.id, input.habitId);
		if (lockedHabit.archivedAt !== null) {
			throw new ApiError("HABIT_ARCHIVED");
		}

		const [updatedHabit] = await tx
			.update(habit)
			.set({ ...request, updatedAt: now })
			.where(eq(habit.id, lockedHabit.id))
			.returning();

		if (!updatedHabit) {
			throw new Error("習慣の更新結果を取得できませんでした。");
		}

		return toHabitResponse(updatedHabit);
	});
}

export async function completeHabit(
	input: HabitMutationInput,
): Promise<CompleteHabitResponse> {
	const now = input.now ?? new Date();
	const { today, yesterday } = getJstDateContext(now);

	try {
		return await db.transaction(async (tx) => {
			// update / archive と同じ habit 行ロックを使い、操作の成立順を直列化する。
			const lockedHabit = await lockHabit(tx, input.user.id, input.habitId);
			if (lockedHabit.archivedAt !== null) {
				throw new ApiError("HABIT_ARCHIVED");
			}

			const [latestRecord] = await tx
				.select({ date: dailyRecord.date })
				.from(dailyRecord)
				.where(eq(dailyRecord.habitId, lockedHabit.id))
				.orderBy(desc(dailyRecord.date))
				.limit(1);

			if (latestRecord?.date === today) {
				throw new ApiError("HABIT_ALREADY_COMPLETED_TODAY");
			}

			const currentStreak =
				latestRecord?.date === yesterday ? lockedHabit.currentStreak + 1 : 1;
			const maxStreak = Math.max(lockedHabit.maxStreak, currentStreak);

			const [createdRecord] = await tx
				.insert(dailyRecord)
				.values({
					habitId: lockedHabit.id,
					date: today,
					completedAt: now,
				})
				.returning();

			if (!createdRecord) {
				throw new Error("達成記録の作成結果を取得できませんでした。");
			}

			const [updatedHabit] = await tx
				.update(habit)
				.set({
					currentStreak,
					maxStreak,
					updatedAt: now,
				})
				.where(eq(habit.id, lockedHabit.id))
				.returning();

			if (!updatedHabit) {
				throw new Error("習慣の更新結果を取得できませんでした。");
			}

			return {
				dailyRecord: {
					id: createdRecord.id,
					habitId: createdRecord.habitId,
					date: createdRecord.date,
					completedAt: toJstDateTimeString(createdRecord.completedAt),
				},
				habit: toHabitSummary(updatedHabit),
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
