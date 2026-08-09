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
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
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
				<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-start">
					<CompleteButton habit={habit} onUnauthorized={onUnauthorized} />
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
