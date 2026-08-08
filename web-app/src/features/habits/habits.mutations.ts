import {
	type QueryClient,
	useIsMutating,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { type RefObject, useCallback, useRef } from "react";
import type { HomeDataResponse } from "~/features/home/home.contract";
import {
	clearHomeCache,
	homeQueryKey,
	invalidateAndRefetchHome,
	preventStaleHomeResponses,
} from "~/features/home/home.query";
import { ApiClientError } from "~/lib/api/client";
import {
	archiveHabit as archiveHabitRequest,
	completeHabit as completeHabitRequest,
	createHabit as createHabitRequest,
	updateHabit as updateHabitRequest,
} from "./habits.api-client";
import type {
	CompleteHabitResponse,
	CreateHabitRequest,
	UpdateHabitRequest,
} from "./habits.api-contract";

type HabitOperation = "update" | "archive" | "complete";

export function habitMutationKey(habitId: string, operation: HabitOperation) {
	return ["habit", habitId, operation] as const;
}

export function habitMutationPrefix(habitId: string) {
	return ["habit", habitId] as const;
}

export function isHabitMutationPending(
	queryClient: QueryClient,
	habitId: string,
): boolean {
	return (
		queryClient.isMutating({ mutationKey: habitMutationPrefix(habitId) }) > 0
	);
}

export function useIsHabitMutationPending(habitId: string): boolean {
	return useIsMutating({ mutationKey: habitMutationPrefix(habitId) }) > 0;
}

function isStaleStateError(error: unknown): boolean {
	return (
		error instanceof ApiClientError &&
		(error.code === "HABIT_ARCHIVED" ||
			error.code === "HABIT_NOT_FOUND" ||
			error.code === "HABIT_ALREADY_COMPLETED_TODAY")
	);
}

/**
 * stale-state error は一度 UI に表示した後、再同期済みであることを確認してから
 * 呼び出し側が明示的に消去する。通常の入力エラーや network error は消去しない。
 */
function useStaleStateErrorReset(
	error: unknown,
	reset: () => void,
	synchronized: RefObject<boolean>,
) {
	return useCallback(() => {
		if (!synchronized.current || !isStaleStateError(error)) {
			return false;
		}
		reset();
		synchronized.current = false;
		return true;
	}, [error, reset, synchronized]);
}

async function synchronizeMutationError(
	queryClient: QueryClient,
	error: unknown,
	onUnauthorized?: () => void | Promise<void>,
): Promise<boolean> {
	if (!(error instanceof ApiClientError)) {
		return false;
	}
	if (error.status === 401) {
		try {
			await clearHomeCache(queryClient);
		} catch {
			// 元の mutation error はセッション更新処理の失敗で置き換えない。
		}
		try {
			await onUnauthorized?.();
		} catch {
			// UI は元の 401 を使って未認証状態へ遷移できる。
		}
		return false;
	}
	if (isStaleStateError(error)) {
		return invalidateAndRefetchHome(queryClient);
	}
	return false;
}

function applyCompletedHabit(
	queryClient: QueryClient,
	completed: CompleteHabitResponse,
): void {
	queryClient.setQueryData<HomeDataResponse>(homeQueryKey, (home) => {
		if (!home) {
			return home;
		}
		return {
			...home,
			habits: home.habits.map((habit) =>
				habit.id === completed.habit.id
					? {
							...habit,
							isCompletedToday: completed.habit.isCompletedToday,
							currentStreak: completed.habit.currentStreak,
							maxStreak: completed.habit.maxStreak,
						}
					: habit,
			),
		};
	});
}

function hasInvalidatedHomeRefetch(queryClient: QueryClient): boolean {
	return queryClient
		.getQueryCache()
		.findAll({ queryKey: homeQueryKey, exact: true })
		.some(
			(query) =>
				query.state.isInvalidated && query.state.fetchStatus === "fetching",
		);
}

export function useCreateHabitMutation(
	options: { onUnauthorized?: () => void | Promise<void> } = {},
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: ["habit", "create"],
		mutationFn: (request: CreateHabitRequest) => createHabitRequest(request),
		onSuccess: () => invalidateAndRefetchHome(queryClient),
		onError: (error) => {
			void synchronizeMutationError(queryClient, error, options.onUnauthorized);
		},
	});
}

export function useUpdateHabitMutation(
	habitId: string,
	options: { onUnauthorized?: () => void | Promise<void> } = {},
) {
	const queryClient = useQueryClient();
	const staleStateSynchronized = useRef(false);
	const mutation = useMutation({
		mutationKey: habitMutationKey(habitId, "update"),
		mutationFn: (request: UpdateHabitRequest) =>
			updateHabitRequest(habitId, request),
		onSuccess: () => invalidateAndRefetchHome(queryClient),
		onError: (error) => {
			staleStateSynchronized.current = false;
			void synchronizeMutationError(
				queryClient,
				error,
				options.onUnauthorized,
			).then((synchronized) => {
				staleStateSynchronized.current = synchronized;
			});
		},
	});
	const resetStaleStateError = useStaleStateErrorReset(
		mutation.error,
		mutation.reset,
		staleStateSynchronized,
	);
	return { ...mutation, resetStaleStateError };
}

export function useArchiveHabitMutation(
	habitId: string,
	options: { onUnauthorized?: () => void | Promise<void> } = {},
) {
	const queryClient = useQueryClient();
	const staleStateSynchronized = useRef(false);
	const mutation = useMutation({
		mutationKey: habitMutationKey(habitId, "archive"),
		mutationFn: () => archiveHabitRequest(habitId),
		onSuccess: () => invalidateAndRefetchHome(queryClient),
		onError: (error) => {
			staleStateSynchronized.current = false;
			void synchronizeMutationError(
				queryClient,
				error,
				options.onUnauthorized,
			).then((synchronized) => {
				staleStateSynchronized.current = synchronized;
			});
		},
	});
	const resetStaleStateError = useStaleStateErrorReset(
		mutation.error,
		mutation.reset,
		staleStateSynchronized,
	);
	return { ...mutation, resetStaleStateError };
}

export function useCompleteHabitMutation(
	habitId: string,
	options: { onUnauthorized?: () => void | Promise<void> } = {},
) {
	const queryClient = useQueryClient();
	const staleStateSynchronized = useRef(false);
	const mutation = useMutation({
		mutationKey: habitMutationKey(habitId, "complete"),
		mutationFn: () => completeHabitRequest(habitId),
		onMutate: () => ({
			refetchAfterComplete: hasInvalidatedHomeRefetch(queryClient),
		}),
		onSuccess: (response, _variables, context) => {
			const refetchAfterComplete =
				context?.refetchAfterComplete || hasInvalidatedHomeRefetch(queryClient);
			// 完了前に始まった GET は、完了レスポンスによる patch を上書きできない。
			preventStaleHomeResponses(queryClient);
			applyCompletedHabit(queryClient, response);
			// create / edit / archive の再取得が完了操作と競合した場合だけ、最終
			// server state を取り直す。通常のcomplete成功では追加GETを行わない。
			if (refetchAfterComplete) {
				void invalidateAndRefetchHome(queryClient);
			}
		},
		onError: (error) => {
			staleStateSynchronized.current = false;
			void synchronizeMutationError(
				queryClient,
				error,
				options.onUnauthorized,
			).then((synchronized) => {
				staleStateSynchronized.current = synchronized;
			});
		},
	});
	const resetStaleStateError = useStaleStateErrorReset(
		mutation.error,
		mutation.reset,
		staleStateSynchronized,
	);
	return { ...mutation, resetStaleStateError };
}
