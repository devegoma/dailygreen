import { useRef } from "react";
import type { HomeHabit } from "~/features/home/home.contract";
import { HabitCard } from "./habit-card";

type HabitListProps = {
	habits: readonly HomeHabit[];
	onUnauthorized?: () => void | Promise<void>;
};

export function HabitList({ habits, onUnauthorized }: HabitListProps) {
	const archiveFallbackFocusRef = useRef<HTMLElement>(null);

	return (
		<section
			aria-label="今日の習慣"
			className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
			ref={archiveFallbackFocusRef}
			tabIndex={-1}
		>
			{habits.length === 0 ? (
				<div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
					<p>今日の習慣はまだありません。</p>
					<p className="mt-1">まずは小さな習慣を1つ追加しましょう。</p>
				</div>
			) : (
				<ul className="space-y-3" aria-label="今日の習慣一覧">
					{habits.map((habit) => (
						<li key={habit.id}>
							<HabitCard
								archiveFallbackFocusRef={archiveFallbackFocusRef}
								habit={habit}
								onUnauthorized={onUnauthorized}
							/>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
