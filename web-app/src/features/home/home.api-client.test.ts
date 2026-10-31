import { afterEach, describe, expect, it, vi } from "vitest";
import { getHomeData } from "./home.api-client";

const fetchMock = vi.fn();

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("getHomeData", () => {
	it("GET /api/homeで正常取得しAbortSignalをrequestへ渡す", async () => {
		const home = {
			habits: [],
			activityLog: [{ date: "2026-08-08", completionRate: null }],
		};
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify(home), {
					headers: { "content-type": "application/json" },
				}),
			),
		);
		const controller = new AbortController();

		await expect(getHomeData(controller.signal)).resolves.toEqual(home);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/home",
			expect.objectContaining({
				method: "GET",
				signal: controller.signal,
			}),
		);
	});
});
