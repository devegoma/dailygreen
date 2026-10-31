import { ApiError } from "./errors";

export async function parseJsonBody(request: Request): Promise<unknown> {
	const rawBody = await request.text();
	if (!rawBody.trim()) {
		throw new ApiError("INVALID_REQUEST", "リクエストボディが空です。");
	}

	try {
		return JSON.parse(rawBody) as unknown;
	} catch (error) {
		throw new ApiError(
			"INVALID_REQUEST",
			"リクエストボディはJSON形式で指定してください。",
			{ cause: error },
		);
	}
}
