import { AddHabitDialog } from "~/features/habits/add-habit-dialog";
import { HabitList } from "~/features/habits/habit-list";
import { TodaySummary } from "~/features/habits/today-summary";
import { NotificationSettingsCard } from "~/features/push/notification-settings-card";
import { ActivityLog } from "./activity-log";
import type { HomeDataResponse } from "./home.contract";

type HomeMainContentProps = {
	backgroundError: boolean;
	home: HomeDataResponse;
	onRetry: () => void;
	onUnauthorized: () => void | Promise<void>;
};

/** API から得たホームデータを各 pure UI component へ接続する画面本体。 */
export function HomeMainContent({
	backgroundError,
	home,
	onRetry,
	onUnauthorized,
}: HomeMainContentProps) {
	return (
		<main
			className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
			id="main-content"
		>
			{backgroundError ? (
				<div
					className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
					role="status"
				>
					<p>
						最新データの取得に失敗しました。表示中の内容は前回取得時のものです。
					</p>
					<button
						className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold text-amber-950 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
						onClick={onRetry}
						type="button"
					>
						再読み込み
					</button>
				</div>
			) : null}
			<section aria-labelledby="activity-log-heading">
				<div className="mb-4">
					<h1
						className="text-xl font-semibold tracking-tight text-stone-950"
						id="activity-log-heading"
					>
						アクティビティログ
					</h1>
					<p className="mt-1 text-sm text-stone-600">直近365日の達成状況</p>
				</div>
				<div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
					<ActivityLog entries={home.activityLog} />
				</div>
			</section>

			<NotificationSettingsCard onUnauthorized={onUnauthorized} />

			<section aria-labelledby="today-habits-heading" className="mt-10">
				<div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2
							className="text-xl font-semibold tracking-tight text-stone-950"
							id="today-habits-heading"
						>
							今日の習慣
						</h2>
						<TodaySummary habits={home.habits} />
					</div>
					<AddHabitDialog onUnauthorized={onUnauthorized} />
				</div>
				<HabitList habits={home.habits} onUnauthorized={onUnauthorized} />
			</section>
		</main>
	);
}
