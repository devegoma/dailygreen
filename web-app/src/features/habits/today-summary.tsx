import type { HomeHabit } from "~/features/home/home.contract";

export function TodaySummary({ habits }: { habits: readonly HomeHabit[] }) {
	if (habits.length === 0) {
		return null;
	}

	const completedCount = habits.filter(
		(habit) => habit.isCompletedToday,
	).length;
	return (
		<p
			aria-live="polite"
			className="text-sm font-medium text-stone-600"
			data-testid="today-summary"
		>
			{completedCount} / {habits.length} 完了
		</p>
	);
}
