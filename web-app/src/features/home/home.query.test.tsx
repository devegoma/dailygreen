import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "~/lib/api/client";
import type { HomeDataResponse } from "./home.contract";
import {
	clearHomeCache,
	homeQueryKey,
	homeQueryOptions,
	invalidateAndRefetchHome,
	useHomeQuery,
} from "./home.query";

const fetchMock = vi.fn();

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("homeQueryOptions", () => {
	it("4xxはretryせずnetwork errorと5xxだけ最大1回retryする", () => {
		const options = homeQueryOptions({ enabled: true });
		if (typeof options.retry !== "function") {
			throw new Error("retry function is required");
		}

		expect(options.retry(0, new ApiClientError("bad", { status: 400 }))).toBe(
			false,
		);
		expect(
			options.retry(0, new ApiClientError("server", { status: 500 })),
		).toBe(true);
		expect(
			options.retry(1, new ApiClientError("server", { status: 500 })),
		).toBe(false);
		expect(options.retry(0, new ApiClientError("offline"))).toBe(true);
	});

	it("401時にcacheを破棄してsession再確認callbackを呼ぶ", async () => {
		const queryClient = createQueryClient();
		const onUnauthorized = vi.fn();
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValueOnce(
				jsonResponse(
					{ code: "UNAUTHORIZED", message: "ログインが必要です。" },
					401,
				),
			),
		);

		renderHook(
			() => useHomeQuery({ enabled: true, userId: "user-a", onUnauthorized }),
			{ wrapper: wrapper(queryClient) },
		);

		await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		expect(queryClient.getQueryData(homeQueryKey)).toBeUndefined();
	});

	it("session identity切替中は旧homeを表示せずcacheを破棄する", async () => {
		const queryClient = createQueryClient();
		queryClient.setQueryData(homeQueryKey, homeData);
		vi.stubGlobal("fetch", fetchMock.mockResolvedValue(jsonResponse(homeData)));
		const { result, rerender } = renderHook(
			({ userId }) => useHomeQuery({ enabled: true, userId }),
			{ initialProps: { userId: "user-a" }, wrapper: wrapper(queryClient) },
		);

		await waitFor(() => expect(result.current.data).toEqual(homeData));
		rerender({ userId: "user-b" });
		expect(result.current.data).toBeUndefined();
		await waitFor(() =>
			expect(queryClient.getQueryData(homeQueryKey)).toBeUndefined(),
		);
	});
});

describe("home cache utility", () => {
	it("logout用clearはin-flight queryをcancelしてhome cacheを削除する", async () => {
		const queryClient = createQueryClient();
		queryClient.setQueryData(homeQueryKey, homeData);
		const cancelQueries = vi.spyOn(queryClient, "cancelQueries");

		await clearHomeCache(queryClient);

		expect(cancelQueries).toHaveBeenCalledWith({ queryKey: homeQueryKey });
		expect(queryClient.getQueryData(homeQueryKey)).toBeUndefined();
	});

	it("invalidate後にactiveなhome queryをserverからrefetchする", async () => {
		const queryClient = createQueryClient();
		const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
		const refetchQueries = vi.spyOn(queryClient, "refetchQueries");

		await invalidateAndRefetchHome(queryClient);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: homeQueryKey,
			refetchType: "none",
		});
		expect(refetchQueries).toHaveBeenCalledWith({
			queryKey: homeQueryKey,
			type: "active",
		});
	});
});

const homeData: HomeDataResponse = {
	habits: [
		{
			id: "habit-1",
			name: "読書",
			emoji: "📚",
			currentStreak: 1,
			maxStreak: 2,
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
