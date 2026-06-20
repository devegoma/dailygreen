import assert from "node:assert/strict";
import { ApiError } from "./errors";
import { handleApiRequest } from "./route";

export async function testUnauthenticatedRequestReturnsUnified401() {
	const response = await handleApiRequest({
		request: new Request("http://localhost/api/home"),
		authenticate: async () => null,
		handler: async () => ({ ok: true }),
	});

	assert.equal(response.status, 401);
	assert.deepEqual(await response.json(), {
		code: "UNAUTHORIZED",
		message: "ログインが必要です。",
	});
}

export async function testAuthenticatedRequestMapsJsonResponse() {
	const response = await handleApiRequest({
		request: new Request("http://localhost/api/habits", { method: "POST" }),
		authenticate: async () => ({ id: "user_1" }),
		handler: async ({ user }) => ({ userId: user.id }),
		successStatus: 201,
	});

	assert.equal(response.status, 201);
	assert.deepEqual(await response.json(), { userId: "user_1" });
}

export async function testApiErrorMapsToUnifiedBody() {
	const response = await handleApiRequest({
		request: new Request("http://localhost/api/habits"),
		authenticate: async () => ({ id: "user_1" }),
		handler: async () => {
			throw new ApiError("INVALID_REQUEST", "bad request");
		},
	});

	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), {
		code: "INVALID_REQUEST",
		message: "bad request",
	});
}
