import type { HomeHabit } from "~/features/home/home.contract";
import { HabitCard } from "./habit-card";

type HabitListProps = {
	habits: readonly HomeHabit[];
	onUnauthorized?: () => void | Promise<void>;
};

export function HabitList({ habits, onUnauthorized }: HabitListProps) {
	if (habits.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
				<p>今日の習慣はまだありません。</p>
				<p className="mt-1">まずは小さな習慣を1つ追加しましょう。</p>
			</div>
		);
	}

	return (
		<ul className="space-y-3" aria-label="今日の習慣一覧">
			{habits.map((habit) => (
				<li key={habit.id}>
					<HabitCard habit={habit} onUnauthorized={onUnauthorized} />
				</li>
			))}
		</ul>
	);
}
