import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { handleApiRequest } from "./route";

describe("handleApiRequest", () => {
	it("未認証リクエストでは統一形式の 401 レスポンスを返す", async () => {
		const response = await handleApiRequest({
			request: new Request("http://localhost/api/home"),
			authenticate: async () => null,
			handler: async () => ({ ok: true }),
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			code: "UNAUTHORIZED",
			message: "ログインが必要です。",
		});
	});

	it("認証済みユーザーの handler 結果を JSON レスポンスとして返す", async () => {
		const response = await handleApiRequest({
			request: new Request("http://localhost/api/habits", { method: "POST" }),
			authenticate: async () => ({ id: "user_1" }),
			handler: async ({ user }) => ({ userId: user.id }),
			successStatus: 201,
		});

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ userId: "user_1" });
	});

	it("ApiError 例外を統一形式の JSON レスポンスに変換する", async () => {
		const response = await handleApiRequest({
			request: new Request("http://localhost/api/habits"),
			authenticate: async () => ({ id: "user_1" }),
			handler: async () => {
				throw new ApiError("INVALID_REQUEST", "bad request");
			},
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			code: "INVALID_REQUEST",
			message: "bad request",
		});
	});

	it("想定外例外をrequest ID付き500レスポンスと構造化ログへ変換する", async () => {
		const errorLog = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const response = await handleApiRequest({
			request: new Request("http://localhost/api/habits", {
				headers: { "x-request-id": "request-123" },
			}),
			authenticate: async () => ({ id: "user_1" }),
			handler: async () => {
				throw new Error("database unavailable");
			},
		});

		expect(response.status).toBe(500);
		expect(response.headers.get("x-request-id")).toBe("request-123");
		expect(errorLog).toHaveBeenCalledWith(
			expect.stringContaining('"requestId":"request-123"'),
		);
		errorLog.mockRestore();
	});
});
