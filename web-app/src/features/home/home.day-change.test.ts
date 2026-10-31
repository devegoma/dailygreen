import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	millisecondsUntilNextJstMidnight,
	scheduleJstMidnightRefresh,
	useJstMidnightHomeRefresh,
} from "./home.day-change";
import { homeQueryKey } from "./home.query";

afterEach(() => {
	vi.useRealTimers();
});

describe("JST midnight refresh", () => {
	it("次のJST 00:00でinvalidate用callbackを実行し翌日も再予約する", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-08T14:59:59.000Z"));
		const onMidnight = vi.fn();
		const stop = scheduleJstMidnightRefresh(onMidnight);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(onMidnight).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);
		expect(onMidnight).toHaveBeenCalledTimes(2);
		stop();
	});

	it("cleanup後は予約済みtimerを実行しない", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-08T14:59:59.000Z"));
		const onMidnight = vi.fn();
		const stop = scheduleJstMidnightRefresh(onMidnight);

		stop();
		await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1_000);
		expect(onMidnight).not.toHaveBeenCalled();
	});

	it("JST基準で次の00:00までの時間を算出する", () => {
		expect(
			millisecondsUntilNextJstMidnight(new Date("2026-08-08T14:59:59.000Z")),
		).toBe(1_000);
	});

	it("hookはJST 00:00にhomeをinvalidateしてactive queryをrefetchする", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-08T14:59:59.000Z"));
		const queryClient = new QueryClient();
		const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
		const refetchQueries = vi.spyOn(queryClient, "refetchQueries");
		const { unmount } = renderHook(() =>
			useJstMidnightHomeRefresh(queryClient, true),
		);

		await vi.advanceTimersByTimeAsync(1_000);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: homeQueryKey,
			refetchType: "none",
		});
		expect(refetchQueries).toHaveBeenCalledWith(
			{
				queryKey: homeQueryKey,
				type: "active",
			},
			{ throwOnError: true },
		);
		unmount();
	});
});
