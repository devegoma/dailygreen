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

	it("immutableなheadersを持つResponseにもrequest IDを付与する", async () => {
		const response = await handleApiRequest({
			request: new Request("http://localhost/api/home"),
			authenticate: async () => ({ id: "user_1" }),
			handler: async () => Response.redirect("http://localhost/login"),
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("http://localhost/login");
		expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
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
				headers: {
					"x-request-id": "123e4567-e89b-42d3-a456-426614174000",
				},
			}),
			authenticate: async () => ({ id: "user_1" }),
			handler: async () => {
				throw new Error("database unavailable");
			},
		});

		expect(response.status).toBe(500);
		expect(response.headers.get("x-request-id")).toBe(
			"123e4567-e89b-42d3-a456-426614174000",
		);
		expect(errorLog).toHaveBeenCalledWith(
			expect.stringContaining(
				'"requestId":"123e4567-e89b-42d3-a456-426614174000"',
			),
		);
		errorLog.mockRestore();
	});

	it("不正なrequest IDを受け取った場合は新しいUUIDを発行する", async () => {
		const response = await handleApiRequest({
			request: new Request("http://localhost/api/home", {
				headers: { "x-request-id": "attacker-controlled-id" },
			}),
			authenticate: async () => ({ id: "user_1" }),
			handler: async () => ({ ok: true }),
		});

		expect(response.headers.get("x-request-id")).not.toBe(
			"attacker-controlled-id",
		);
		expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
	});
});
