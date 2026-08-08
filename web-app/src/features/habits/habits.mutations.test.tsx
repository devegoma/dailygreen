import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeDataResponse } from "~/features/home/home.contract";
import { homeQueryKey, homeQueryOptions } from "~/features/home/home.query";
import {
	habitMutationKey,
	isHabitMutationPending,
	useArchiveHabitMutation,
	useCompleteHabitMutation,
	useCreateHabitMutation,
	useUpdateHabitMutation,
} from "./habits.mutations";

const fetchMock = vi.fn();

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("habit mutations", () => {
	it("create/update/archive成功後にhomeをinvalidateしてrefetchする", async () => {
		const queryClient = createQueryClient();
		const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
		const refetchQueries = vi.spyOn(queryClient, "refetchQueries");
		vi.stubGlobal(
			"fetch",
			fetchMock
				.mockResolvedValueOnce(jsonResponse(habitResponse))
				.mockResolvedValueOnce(jsonResponse(habitResponse))
				.mockResolvedValueOnce(jsonResponse(habitResponse)),
		);
		const create = renderHook(() => useCreateHabitMutation(), {
			wrapper: wrapper(queryClient),
		});
		const update = renderHook(() => useUpdateHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});
		const archive = renderHook(() => useArchiveHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});

		await create.result.current.mutateAsync({ name: "読書", emoji: "📚" });
		await update.result.current.mutateAsync({ name: "運動" });
		await archive.result.current.mutateAsync();

		expect(invalidateQueries).toHaveBeenCalledTimes(3);
		expect(refetchQueries).toHaveBeenCalledTimes(3);
	});

	it("completeはin-flight home queryをcancelしてから対象habitの3フィールドだけを更新する", async () => {
		const queryClient = createQueryClient();
		const original = structuredClone(homeData);
		queryClient.setQueryData(homeQueryKey, original);
		await queryClient.invalidateQueries({
			queryKey: homeQueryKey,
			refetchType: "none",
		});
		let homeRequestAborted = false;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string, init?: RequestInit) => {
				if (path === "/api/home") {
					return new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							homeRequestAborted = true;
							reject(new DOMException("Aborted", "AbortError"));
						});
					});
				}
				return Promise.resolve(jsonResponse(completeResponse));
			}),
		);
		const inFlightHome = queryClient.fetchQuery(
			homeQueryOptions({ enabled: true }),
		);
		void inFlightHome.catch(() => undefined);
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith("/api/home", expect.anything()),
		);
		const { result } = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});

		await result.current.mutateAsync();

		expect(homeRequestAborted).toBe(true);
		const updated = queryClient.getQueryData<HomeDataResponse>(homeQueryKey);
		expect(updated?.habits).toEqual([
			{
				...original.habits[0],
				isCompletedToday: true,
				currentStreak: 2,
				maxStreak: 4,
			},
			original.habits[1],
		]);
		expect(updated?.activityLog).toBe(original.activityLog);
	});

	it("stale-state error後はserverを正としてhomeを再取得する", async () => {
		const queryClient = createQueryClient();
		const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
		const refetchQueries = vi.spyOn(queryClient, "refetchQueries");
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValueOnce(
				jsonResponse(
					{ code: "HABIT_ALREADY_COMPLETED_TODAY", message: "達成済みです。" },
					409,
				),
			),
		);
		const { result } = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});

		await expect(result.current.mutateAsync()).rejects.toMatchObject({
			code: "HABIT_ALREADY_COMPLETED_TODAY",
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: homeQueryKey,
			refetchType: "none",
		});
		expect(refetchQueries).toHaveBeenCalledWith({
			queryKey: homeQueryKey,
			type: "active",
		});
		await waitFor(() =>
			expect(result.current.error).toMatchObject({
				code: "HABIT_ALREADY_COMPLETED_TODAY",
			}),
		);
		let reset = false;
		act(() => {
			reset = result.current.resetStaleStateError();
		});
		expect(reset).toBe(true);
		await waitFor(() => expect(result.current.error).toBeNull());
	});

	it("同一habitのmutation keyは共通prefixでpendingを検知できる", async () => {
		const queryClient = createQueryClient();
		let finish: (() => void) | undefined;
		const mutation = queryClient.getMutationCache().build(queryClient, {
			mutationKey: habitMutationKey("habit-1", "complete"),
			mutationFn: () =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		});

		const execution = mutation.execute(undefined);
		await waitFor(() => expect(finish).toBeTypeOf("function"));
		expect(isHabitMutationPending(queryClient, "habit-1")).toBe(true);
		expect(isHabitMutationPending(queryClient, "habit-2")).toBe(false);
		finish?.();
		await execution;
		expect(habitMutationKey("habit-1", "update")).toEqual([
			"habit",
			"habit-1",
			"update",
		]);
	});
});

const habitResponse = {
	id: "habit-1",
	name: "読書",
	emoji: "📚",
	currentStreak: 1,
	maxStreak: 1,
	createdAt: "2026-08-08T00:00:00+09:00",
	archivedAt: null,
};
const completeResponse = {
	dailyRecord: {
		id: "record-1",
		habitId: "habit-1",
		date: "2026-08-08",
		completedAt: "2026-08-08T00:00:00+09:00",
	},
	habit: {
		id: "habit-1",
		name: "サーバー上の名称は使わない",
		emoji: "✅",
		currentStreak: 2,
		maxStreak: 4,
		isCompletedToday: true,
	},
};
const homeData: HomeDataResponse = {
	habits: [
		{
			id: "habit-1",
			name: "読書",
			emoji: "📚",
			currentStreak: 1,
			maxStreak: 3,
			isCompletedToday: false,
		},
		{
			id: "habit-2",
			name: "運動",
			emoji: "🏃",
			currentStreak: 3,
			maxStreak: 3,
			isCompletedToday: false,
		},
	],
	activityLog: [{ date: "2026-08-08", completionRate: null }],
};

function createQueryClient(): QueryClient {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapper(queryClient: QueryClient) {
	return function QueryWrapper({ children }: PropsWithChildren) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}
