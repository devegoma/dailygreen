import type { HomeHabit } from "~/features/home/home.contract";
import { CompleteButton } from "./complete-button";
import { HabitActionMenu } from "./habit-action-menu";

type HabitCardProps = {
	habit: HomeHabit;
	archiveFallbackFocusRef?: React.RefObject<HTMLElement | null>;
	onUnauthorized?: () => void | Promise<void>;
};

export function HabitCard({
	habit,
	archiveFallbackFocusRef,
	onUnauthorized,
}: HabitCardProps) {
	return (
		<article
			className={`rounded-xl border p-4 shadow-sm ${
				habit.isCompletedToday
					? "border-emerald-200 bg-emerald-50"
					: "border-stone-200 bg-white"
			}`}
			data-completed={habit.isCompletedToday ? "true" : "false"}
		>
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
				<div className="col-start-1 row-start-1 min-w-0">
					<h3 className="flex items-center gap-2 text-base font-semibold text-stone-950">
						{habit.emoji === "" ? null : (
							<span aria-hidden="true">{habit.emoji}</span>
						)}
						<span>{habit.name}</span>
					</h3>
					<p className="mt-1 text-sm text-stone-600">
						現在 {habit.currentStreak}日 ・ 最長 {habit.maxStreak}日
					</p>
				</div>
				<div className="col-span-2 col-start-1 row-start-2 w-full sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto">
					<CompleteButton habit={habit} onUnauthorized={onUnauthorized} />
				</div>
				<div className="col-start-2 row-start-1 sm:col-start-3">
					<HabitActionMenu
						archiveFallbackFocusRef={archiveFallbackFocusRef}
						habit={habit}
						onUnauthorized={onUnauthorized}
					/>
				</div>
			</div>
		</article>
	);
}
