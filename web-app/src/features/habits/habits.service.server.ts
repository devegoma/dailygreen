import { eq, sql } from "drizzle-orm";
import { db } from "~/db/index.server";
import { habit, user as userTable } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { toJstDateTimeString } from "~/lib/api/date";
import { ApiError, notImplementedApiError } from "~/lib/api/errors";
import { parseCreateHabitRequest } from "./habits.contract";

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

export async function archiveHabit(_input: HabitMutationInput): Promise<never> {
	throw notImplementedApiError("PATCH /api/habits/:id/archive");
}

export async function completeHabit(
	_input: HabitMutationInput,
): Promise<never> {
	throw notImplementedApiError("POST /api/habits/:id/complete");
}
