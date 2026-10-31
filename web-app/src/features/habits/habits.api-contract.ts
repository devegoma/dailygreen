/** API の習慣作成リクエスト。server/client の両方から利用する。 */
export type CreateHabitRequest = {
	name: string;
	emoji?: string;
};

/** server validation 後の create リクエスト。emoji は空文字に正規化済み。 */
export type ParsedCreateHabitRequest = Required<CreateHabitRequest>;

/** API の習慣更新リクエスト。server/client の両方から利用する。 */
export type UpdateHabitRequest = {
	name?: string;
	emoji?: string;
};

/** create / update / archive の成功レスポンス。 */
export type HabitResponse = {
	id: string;
	name: string;
	emoji: string;
	currentStreak: number;
	maxStreak: number;
	createdAt: string;
	archivedAt: string | null;
};

/** complete 成功時にホームのカードへ反映する最小限の状態。 */
export type CompletedHabit = {
	id: string;
	name: string;
	emoji: string;
	currentStreak: number;
	maxStreak: number;
	isCompletedToday: boolean;
};

export type CompleteHabitResponse = {
	dailyRecord: {
		id: string;
		habitId: string;
		date: string;
		completedAt: string;
	};
	habit: CompletedHabit;
};
