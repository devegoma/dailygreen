import { useEffect, useRef } from "react";
import type { HomeHabit } from "~/features/home/home.contract";
import { ApiClientError } from "~/lib/api/client";
import {
	useCompleteHabitMutation,
	useIsHabitMutationPending,
} from "./habits.mutations";

type CompleteButtonProps = {
	habit: HomeHabit;
	onUnauthorized?: () => void | Promise<void>;
};

export function getCompleteHabitErrorMessage(error: unknown): string | null {
	if (error == null) {
		return null;
	}
	if (!(error instanceof ApiClientError)) {
		return "通信に失敗しました。接続を確認して再試行してください";
	}
	if (error.status === 401) {
		return null;
	}
	switch (error.code) {
		case "HABIT_ALREADY_COMPLETED_TODAY":
			return "この習慣は本日すでに達成済みです";
		case "HABIT_ARCHIVED":
			return "この習慣はすでにアーカイブされています";
		case "HABIT_NOT_FOUND":
			return "習慣が見つかりません";
		case "INTERNAL_SERVER_ERROR":
			return "処理に失敗しました。時間をおいて再試行してください";
		default:
			return error.status === null
				? "通信に失敗しました。接続を確認して再試行してください"
				: "処理に失敗しました。時間をおいて再試行してください";
	}
}

export function CompleteButton({ habit, onUnauthorized }: CompleteButtonProps) {
	const mutation = useCompleteHabitMutation(habit.id, { onUnauthorized });
	const isHabitMutationPending = useIsHabitMutationPending(habit.id);
	const submitInFlight = useRef(false);
	const errorMessage = getCompleteHabitErrorMessage(mutation.error);
	const { isStaleStateSynchronized, resetStaleStateError } = mutation;

	useEffect(() => {
		if (isStaleStateSynchronized) {
			resetStaleStateError();
		}
	}, [isStaleStateSynchronized, resetStaleStateError]);

	const handleClick = () => {
		if (
			habit.isCompletedToday ||
			isHabitMutationPending ||
			submitInFlight.current
		) {
			return;
		}

		submitInFlight.current = true;
		mutation.mutate(undefined, {
			onSettled: () => {
				submitInFlight.current = false;
			},
		});
	};

	const isCompleting = mutation.isPending;
	const isDisabled = habit.isCompletedToday || isHabitMutationPending;
	const label = habit.isCompletedToday
		? "✓ 達成済み"
		: isCompleting
			? "達成しています…"
			: "達成する";

	return (
		<div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
			<button
				aria-busy={isCompleting || undefined}
				aria-label={`${habit.name}を${
					isCompleting
						? "達成しています"
						: habit.isCompletedToday
							? "達成済み"
							: "達成する"
				}`}
				className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-900 sm:w-auto"
				disabled={isDisabled}
				onClick={handleClick}
				type="button"
			>
				{label}
			</button>
			{errorMessage ? (
				<p className="text-sm text-red-700" role="alert">
					{errorMessage}
				</p>
			) : null}
		</div>
	);
}
