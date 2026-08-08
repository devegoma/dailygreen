/** API の GET /api/home 成功レスポンス。server/client の両方から利用する。 */
export type HomeHabit = {
	id: string;
	name: string;
	emoji: string;
	currentStreak: number;
	maxStreak: number;
	isCompletedToday: boolean;
};

export type ActivityLogEntry = {
	date: string;
	completionRate: number | null;
};

export type HomeDataResponse = {
	habits: HomeHabit[];
	activityLog: ActivityLogEntry[];
};
