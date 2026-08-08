import { and, asc, eq, gte, inArray, isNull, lte, max } from "drizzle-orm";
import { db } from "~/db/index.server";
import { dailyRecord, habit } from "~/db/schema";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import {
	addDaysToJstDateString,
	getJstDateContext,
	getJstDateStart,
} from "~/lib/api/date";

export type GetHomeDataInput = {
	user: AuthenticatedUser;
	now?: Date;
};

export type HomeDataResponse = {
	habits: Array<{
		id: string;
		name: string;
		emoji: string;
		currentStreak: number;
		maxStreak: number;
		isCompletedToday: boolean;
	}>;
	activityLog: Array<{
		date: string;
		completionRate: number | null;
	}>;
};

const ACTIVITY_LOG_DAYS = 365;

function getActivityLogDates(today: string): string[] {
	const oldest = addDaysToJstDateString(today, -(ACTIVITY_LOG_DAYS - 1));
	return Array.from({ length: ACTIVITY_LOG_DAYS }, (_, index) =>
		addDaysToJstDateString(oldest, index),
	);
}

export async function getHomeData(
	input: GetHomeDataInput,
): Promise<HomeDataResponse> {
	const now = input.now ?? new Date();
	const { today, yesterday } = getJstDateContext(now);
	const activityDates = getActivityLogDates(today);
	const oldestActivityDate = activityDates[0];

	return db.transaction(async (tx) => {
		// complete / update / archive と同じ habit 行ロックで active 集合を固定する。
		// name 更新との競合時にもロック順が変わらないよう、まず id 順でロックする。
		const lockedHabitIdRows = await tx
			.select({ id: habit.id })
			.from(habit)
			.where(and(eq(habit.userId, input.user.id), isNull(habit.archivedAt)))
			.orderBy(asc(habit.id))
			.for("update");

		const habitIds = lockedHabitIdRows.map((row) => row.id);
		if (habitIds.length === 0) {
			return {
				habits: [],
				activityLog: activityDates.map((date) => ({
					date,
					completionRate: null,
				})),
			};
		}

		// READ COMMITTED では ORDER BY 後の行ロック待機中にソートキーが更新されると、
		// 更新後の値が更新前の位置で返り得る。固定済み ID をロック取得後に再取得し、
		// DB の collation で仕様順を確定する。
		const lockedHabits = await tx
			.select()
			.from(habit)
			.where(
				and(
					eq(habit.userId, input.user.id),
					inArray(habit.id, habitIds),
					isNull(habit.archivedAt),
				),
			)
			.orderBy(asc(habit.name), asc(habit.createdAt), asc(habit.id));
		if (lockedHabits.length !== habitIds.length) {
			throw new Error("固定した習慣を取得できませんでした。");
		}

		const latestRecordRows = await tx
			.select({
				habitId: dailyRecord.habitId,
				date: max(dailyRecord.date),
			})
			.from(dailyRecord)
			.where(inArray(dailyRecord.habitId, habitIds))
			.groupBy(dailyRecord.habitId);
		const latestDateByHabitId = new Map(
			latestRecordRows.map((row) => [row.habitId, row.date]),
		);

		const expiredHabitIds = lockedHabits
			.filter((row) => {
				const latestDate = latestDateByHabitId.get(row.id);
				return (
					row.currentStreak > 0 &&
					(latestDate === undefined ||
						latestDate === null ||
						latestDate < yesterday)
				);
			})
			.map((row) => row.id);

		if (expiredHabitIds.length > 0) {
			const resetHabits = await tx
				.update(habit)
				.set({ currentStreak: 0, updatedAt: now })
				.where(
					and(
						eq(habit.userId, input.user.id),
						inArray(habit.id, expiredHabitIds),
						isNull(habit.archivedAt),
					),
				)
				.returning({ id: habit.id });
			if (resetHabits.length !== expiredHabitIds.length) {
				throw new Error("ストリークの補正結果を取得できませんでした。");
			}
		}
		const expiredHabitIdSet = new Set(expiredHabitIds);

		const activityRecords = await tx
			.select({ habitId: dailyRecord.habitId, date: dailyRecord.date })
			.from(dailyRecord)
			.where(
				and(
					inArray(dailyRecord.habitId, habitIds),
					gte(dailyRecord.date, oldestActivityDate),
					lte(dailyRecord.date, today),
				),
			);
		const completedHabitIdsByDate = new Map<string, Set<string>>();
		for (const record of activityRecords) {
			const completedHabitIds =
				completedHabitIdsByDate.get(record.date) ?? new Set<string>();
			completedHabitIds.add(record.habitId);
			completedHabitIdsByDate.set(record.date, completedHabitIds);
		}

		const completedToday = completedHabitIdsByDate.get(today) ?? new Set();
		return {
			habits: lockedHabits.map((row) => ({
				id: row.id,
				name: row.name,
				emoji: row.emoji,
				currentStreak: expiredHabitIdSet.has(row.id) ? 0 : row.currentStreak,
				maxStreak: row.maxStreak,
				isCompletedToday: completedToday.has(row.id),
			})),
			activityLog: activityDates.map((date) => {
				if (date === today) {
					return { date, completionRate: null };
				}

				const dayEnd = getJstDateStart(addDaysToJstDateString(date, 1));
				const targetHabits = lockedHabits.filter(
					(row) => row.createdAt < dayEnd,
				);
				if (targetHabits.length === 0) {
					return { date, completionRate: null };
				}

				const completedHabitIds =
					completedHabitIdsByDate.get(date) ?? new Set();
				const completedCount = targetHabits.filter((row) =>
					completedHabitIds.has(row.id),
				).length;
				return {
					date,
					completionRate: completedCount / targetHabits.length,
				};
			}),
		};
	});
}
