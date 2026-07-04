import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { handleApiRequest } from "./route";

describe("handleApiRequest", () => {
	it("returns a unified 401 response for unauthenticated requests", async () => {
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

	it("maps authenticated handler results to JSON responses", async () => {
		const response = await handleApiRequest({
			request: new Request("http://localhost/api/habits", { method: "POST" }),
			authenticate: async () => ({ id: "user_1" }),
			handler: async ({ user }) => ({ userId: user.id }),
			successStatus: 201,
		});

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ userId: "user_1" });
	});

	it("maps ApiError exceptions to unified JSON responses", async () => {
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
});
