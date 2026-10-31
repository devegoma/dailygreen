import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, requestJson } from "./client";

const fetchMock = vi.fn();

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("requestJson", () => {
	it("JSON成功レスポンスを返しAbortSignalとcookie設定を渡す", async () => {
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true })),
		);
		const controller = new AbortController();

		await expect(
			requestJson<{ ok: boolean }>("/api/home", { signal: controller.signal }),
		).resolves.toEqual({
			ok: true,
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/home",
			expect.objectContaining({
				credentials: "same-origin",
				signal: controller.signal,
			}),
		);
	});

	it("APIエラーのcode、status、message、x-request-idを保持する", async () => {
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValueOnce(
				jsonResponse(
					{ code: "HABIT_ARCHIVED", message: "アーカイブ済みです。" },
					409,
					"request-123",
				),
			),
		);

		await expect(
			requestJson("/api/habits/habit/complete"),
		).rejects.toMatchObject({
			name: "ApiClientError",
			status: 409,
			code: "HABIT_ARCHIVED",
			message: "アーカイブ済みです。",
			requestId: "request-123",
		});
	});

	it("不正なエラーボディは安全なfallbackへ正規化する", async () => {
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValueOnce(
				new Response("not-json", { status: 500 }),
			),
		);

		await expect(requestJson("/api/home")).rejects.toMatchObject({
			status: 500,
			code: null,
		});
	});

	it("prototype由来のcodeはAPIエラーcodeとして受理せずfallbackへ正規化する", async () => {
		for (const code of ["toString", "constructor"]) {
			vi.stubGlobal(
				"fetch",
				fetchMock.mockResolvedValueOnce(
					jsonResponse({ code, message: "偽のエラーです。" }, 500),
				),
			);

			await expect(requestJson("/api/home")).rejects.toMatchObject({
				status: 500,
				code: null,
				message: "サーバー内部でエラーが発生しました。",
			});
		}
	});

	it("network errorをApiClientErrorへ正規化する", async () => {
		vi.stubGlobal(
			"fetch",
			fetchMock
				.mockRejectedValueOnce(new TypeError("offline"))
				.mockRejectedValueOnce(new TypeError("offline")),
		);

		await expect(requestJson("/api/home")).rejects.toBeInstanceOf(
			ApiClientError,
		);
		await expect(requestJson("/api/home")).rejects.toMatchObject({
			status: null,
			code: null,
			message: "通信に失敗しました。接続を確認して再試行してください",
		});
	});
});

function jsonResponse(
	body: unknown,
	status = 200,
	requestId?: string,
): Response {
	const headers = new Headers({ "content-type": "application/json" });
	if (requestId) {
		headers.set("x-request-id", requestId);
	}
	return new Response(JSON.stringify(body), { status, headers });
}
