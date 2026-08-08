import { ApiClientError } from "~/lib/api/client";

export function getEditHabitErrorMessage(error: unknown): string | null {
	if (!(error instanceof ApiClientError)) {
		return "通信に失敗しました。接続を確認して再試行してください";
	}
	if (error.status === 401) {
		return null;
	}
	if (error.status === null) {
		return "通信に失敗しました。接続を確認して再試行してください";
	}
	switch (error.code) {
		case "INVALID_REQUEST":
			return error.message || "リクエスト内容が不正です。";
		case "HABIT_ARCHIVED":
			return "この習慣はすでにアーカイブされています";
		case "HABIT_NOT_FOUND":
			return "習慣が見つかりません";
		case "INTERNAL_SERVER_ERROR":
			return "処理に失敗しました。時間をおいて再試行してください";
		default:
			return error.status >= 500
				? "処理に失敗しました。時間をおいて再試行してください"
				: "処理に失敗しました。時間をおいて再試行してください";
	}
}

export function getArchiveHabitErrorMessage(error: unknown): string | null {
	if (error instanceof ApiClientError && error.status === 401) {
		return null;
	}
	if (error instanceof ApiClientError && error.code === "HABIT_NOT_FOUND") {
		return "習慣が見つかりません";
	}
	return getEditHabitErrorMessage(error);
}
