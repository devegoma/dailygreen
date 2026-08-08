import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeDataResponse } from "~/features/home/home.contract";
import {
	homeQueryKey,
	homeQueryOptions,
	useHomeQuery,
} from "~/features/home/home.query";
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

	it("complete後に先行したstale GETが解決しても達成結果を上書きしない", async () => {
		const queryClient = createQueryClient();
		const original = structuredClone(homeData);
		queryClient.setQueryData(homeQueryKey, original);
		await queryClient.invalidateQueries({
			queryKey: homeQueryKey,
			refetchType: "none",
		});
		let resolveStaleHome: ((response: Response) => void) | undefined;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					return new Promise<Response>((resolve) => {
						resolveStaleHome = resolve;
					});
				}
				return Promise.resolve(jsonResponse(completeResponse));
			}),
		);
		const inFlightHome = queryClient.fetchQuery(
			homeQueryOptions({ enabled: true }, queryClient),
		);
		void inFlightHome.catch(() => undefined);
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith("/api/home", expect.anything()),
		);
		const { result } = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});

		await result.current.mutateAsync();
		resolveStaleHome?.(jsonResponse(original));
		await inFlightHome.catch(() => undefined);
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

	it("complete単独成功は対象3フィールドだけを更新し、追加GETを行わない", async () => {
		const queryClient = createQueryClient();
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					return Promise.resolve(jsonResponse(homeData));
				}
				return Promise.resolve(jsonResponse(completeResponse));
			}),
		);
		const home = renderHook(
			() => useHomeQuery({ enabled: true, userId: "user-a" }),
			{ wrapper: wrapper(queryClient) },
		);
		const complete = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});
		await waitFor(() => expect(home.result.current.data).toEqual(homeData));

		await complete.result.current.mutateAsync();

		expect(
			fetchMock.mock.calls.filter(([path]) => path === "/api/home"),
		).toHaveLength(1);
		await waitFor(() =>
			expect(home.result.current.data?.habits[0]).toEqual({
				...homeData.habits[0],
				isCompletedToday: true,
				currentStreak: 2,
				maxStreak: 4,
			}),
		);
	});

	it("先行mutationのrefetch中にcompleteしても、complete成功後の再同期で最終server stateを反映する", async () => {
		const queryClient = createQueryClient();
		const finalHome = {
			...homeData,
			habits: [
				{
					...homeData.habits[0],
					isCompletedToday: true,
					currentStreak: 2,
					maxStreak: 4,
				},
				...homeData.habits.slice(1),
				{
					id: "habit-3",
					name: "散歩",
					emoji: "🚶",
					currentStreak: 0,
					maxStreak: 0,
					isCompletedToday: false,
				},
			],
		};
		let resolveComplete: ((response: Response) => void) | undefined;
		let resolveFinalRefetch: ((response: Response) => void) | undefined;
		let refetchAborted = false;
		let homeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string, init?: RequestInit) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					if (homeRequestCount === 1) {
						return Promise.resolve(jsonResponse(homeData));
					}
					if (homeRequestCount === 2) {
						return new Promise<Response>((_resolve, reject) => {
							init?.signal?.addEventListener("abort", () => {
								refetchAborted = true;
								reject(new DOMException("Aborted", "AbortError"));
							});
						});
					}
					return new Promise<Response>((resolve) => {
						resolveFinalRefetch = resolve;
					});
				}
				if (path === "/api/habits/habit-1/complete") {
					return new Promise<Response>((resolve) => {
						resolveComplete = resolve;
					});
				}
				return Promise.resolve(jsonResponse(habitResponse));
			}),
		);
		const home = renderHook(
			() => useHomeQuery({ enabled: true, userId: "user-a" }),
			{ wrapper: wrapper(queryClient) },
		);
		await waitFor(() => expect(home.result.current.data).toEqual(homeData));
		const complete = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});
		const create = renderHook(() => useCreateHabitMutation(), {
			wrapper: wrapper(queryClient),
		});

		act(() => {
			complete.result.current.mutate();
		});
		await waitFor(() => expect(resolveComplete).toBeTypeOf("function"));
		const createExecution = create.result.current.mutateAsync({
			name: "散歩",
			emoji: "🚶",
		});
		await waitFor(() => expect(homeRequestCount).toBe(2));
		expect(refetchAborted).toBe(false);
		resolveComplete?.(jsonResponse(completeResponse));
		await waitFor(() => expect(complete.result.current.isSuccess).toBe(true));

		await waitFor(() => expect(homeRequestCount).toBe(3));
		expect(refetchAborted).toBe(true);
		resolveFinalRefetch?.(jsonResponse(finalHome));
		await createExecution;
		await waitFor(() => expect(home.result.current.data).toEqual(finalHome));
	});

	it("stale-state error後はactiveなGET成功時だけerrorをreset可能にする", async () => {
		const queryClient = createQueryClient();
		let resolveSynchronization: ((response: Response) => void) | undefined;
		let homeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					if (homeRequestCount === 1) {
						return Promise.resolve(jsonResponse(homeData));
					}
					return new Promise<Response>((resolve) => {
						resolveSynchronization = resolve;
					});
				}
				return Promise.resolve(
					jsonResponse(
						{
							code: "HABIT_ALREADY_COMPLETED_TODAY",
							message: "達成済みです。",
						},
						409,
					),
				);
			}),
		);
		renderHook(() => useHomeQuery({ enabled: true, userId: "user-a" }), {
			wrapper: wrapper(queryClient),
		});
		const { result } = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});
		await waitFor(() => expect(homeRequestCount).toBe(1));

		await expect(result.current.mutateAsync()).rejects.toMatchObject({
			code: "HABIT_ALREADY_COMPLETED_TODAY",
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
		expect(reset).toBe(false);
		await waitFor(() => expect(resolveSynchronization).toBeTypeOf("function"));
		resolveSynchronization?.(jsonResponse(homeData));
		await waitFor(() =>
			expect(queryClient.getQueryData(homeQueryKey)).toEqual(homeData),
		);
		act(() => {
			reset = result.current.resetStaleStateError();
		});
		expect(reset).toBe(true);
		await waitFor(() => expect(result.current.error).toBeNull());
	});

	it("stale-state error後のGET失敗時はerrorをreset可能にしない", async () => {
		const queryClient = createQueryClient();
		let homeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					return Promise.resolve(
						jsonResponse(
							homeRequestCount === 1 ? homeData : { message: "failed" },
							homeRequestCount === 1 ? 200 : 500,
						),
					);
				}
				return Promise.resolve(
					jsonResponse(
						{ code: "HABIT_NOT_FOUND", message: "見つかりません。" },
						404,
					),
				);
			}),
		);
		renderHook(() => useHomeQuery({ enabled: true, userId: "user-a" }), {
			wrapper: wrapper(queryClient),
		});
		const { result } = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});
		await waitFor(() => expect(homeRequestCount).toBe(1));

		await expect(result.current.mutateAsync()).rejects.toMatchObject({
			code: "HABIT_NOT_FOUND",
		});
		await waitFor(() => expect(homeRequestCount).toBe(2));
		await waitFor(() =>
			expect(result.current.error).toMatchObject({ status: 404 }),
		);
		let reset = false;
		act(() => {
			reset = result.current.resetStaleStateError();
		});
		expect(reset).toBe(false);
	});

	it("stale-state error後に同期GETがcancelされた場合はerrorをreset可能にしない", async () => {
		const queryClient = createQueryClient();
		let homeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string, init?: RequestInit) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					if (homeRequestCount === 1) {
						return Promise.resolve(jsonResponse(homeData));
					}
					return new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () =>
							reject(new DOMException("Aborted", "AbortError")),
						);
					});
				}
				return Promise.resolve(
					jsonResponse(
						{
							code: "HABIT_ALREADY_COMPLETED_TODAY",
							message: "達成済みです。",
						},
						409,
					),
				);
			}),
		);
		renderHook(() => useHomeQuery({ enabled: true, userId: "user-a" }), {
			wrapper: wrapper(queryClient),
		});
		const { result } = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});
		await waitFor(() => expect(homeRequestCount).toBe(1));

		await expect(result.current.mutateAsync()).rejects.toMatchObject({
			code: "HABIT_ALREADY_COMPLETED_TODAY",
		});
		await waitFor(() => expect(homeRequestCount).toBe(2));
		await queryClient.cancelQueries({ queryKey: homeQueryKey });
		await waitFor(() =>
			expect(result.current.error).toMatchObject({
				code: "HABIT_ALREADY_COMPLETED_TODAY",
			}),
		);

		let reset = false;
		act(() => {
			reset = result.current.resetStaleStateError();
		});
		expect(reset).toBe(false);
	});

	it("stale同期GET中のcomplete patchで古いGETが不採用でもerrorをreset可能にしない", async () => {
		const queryClient = createQueryClient();
		let homeRequestCount = 0;
		let completeRequestCount = 0;
		let resolveStaleHome: ((response: Response) => void) | undefined;
		let resolveFinalHome: ((response: Response) => void) | undefined;
		let staleHomeAborted = false;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string, init?: RequestInit) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					if (homeRequestCount === 1) {
						return Promise.resolve(jsonResponse(homeData));
					}
					if (homeRequestCount === 2) {
						return new Promise<Response>((resolve) => {
							resolveStaleHome = resolve;
							init?.signal?.addEventListener("abort", () => {
								staleHomeAborted = true;
							});
						});
					}
					return new Promise<Response>((resolve) => {
						resolveFinalHome = resolve;
					});
				}
				completeRequestCount += 1;
				return Promise.resolve(
					completeRequestCount === 1
						? jsonResponse(
								{
									code: "HABIT_ALREADY_COMPLETED_TODAY",
									message: "達成済みです。",
								},
								409,
							)
						: jsonResponse(completeResponse),
				);
			}),
		);
		renderHook(() => useHomeQuery({ enabled: true, userId: "user-a" }), {
			wrapper: wrapper(queryClient),
		});
		const stale = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});
		const successful = renderHook(() => useCompleteHabitMutation("habit-1"), {
			wrapper: wrapper(queryClient),
		});
		await waitFor(() => expect(homeRequestCount).toBe(1));

		await expect(stale.result.current.mutateAsync()).rejects.toMatchObject({
			code: "HABIT_ALREADY_COMPLETED_TODAY",
		});
		await waitFor(() => expect(homeRequestCount).toBe(2));
		await successful.result.current.mutateAsync();
		await waitFor(() => expect(homeRequestCount).toBe(3));
		expect(staleHomeAborted).toBe(true);
		resolveStaleHome?.(jsonResponse(homeData));
		resolveFinalHome?.(
			jsonResponse({
				...homeData,
				habits: [
					{
						...homeData.habits[0],
						isCompletedToday: true,
						currentStreak: 2,
						maxStreak: 4,
					},
					...homeData.habits.slice(1),
				],
			}),
		);

		await waitFor(() =>
			expect(stale.result.current.error).toMatchObject({
				code: "HABIT_ALREADY_COMPLETED_TODAY",
			}),
		);
		let reset = false;
		act(() => {
			reset = stale.result.current.resetStaleStateError();
		});
		expect(reset).toBe(false);
	});

	it("stale-state error時にactiveなhome queryがなければerrorをreset可能にしない", async () => {
		const queryClient = createQueryClient();
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
		await waitFor(() =>
			expect(result.current.error).toMatchObject({
				code: "HABIT_ALREADY_COMPLETED_TODAY",
			}),
		);
		let reset = false;
		act(() => {
			reset = result.current.resetStaleStateError();
		});
		expect(reset).toBe(false);
	});

	it("mutationの401でsession callbackが失敗しても元のApiClientErrorを保持する", async () => {
		const queryClient = createQueryClient();
		const onUnauthorized = vi
			.fn()
			.mockRejectedValue(new Error("session failed"));
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValueOnce(
				jsonResponse(
					{ code: "UNAUTHORIZED", message: "ログインが必要です。" },
					401,
				),
			),
		);
		const { result } = renderHook(
			() => useCreateHabitMutation({ onUnauthorized }),
			{ wrapper: wrapper(queryClient) },
		);

		await expect(
			result.current.mutateAsync({ name: "読書", emoji: "📚" }),
		).rejects.toMatchObject({
			name: "ApiClientError",
			status: 401,
			code: "UNAUTHORIZED",
		});
		await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledTimes(1);
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
