import {
	type ApiErrorCode,
	apiErrorMessages,
	apiErrorStatuses,
} from "./errors";

const DEFAULT_ERROR_MESSAGE =
	"通信に失敗しました。接続を確認して再試行してください";

export class ApiClientError extends Error {
	readonly status: number | null;
	readonly code: ApiErrorCode | null;
	readonly requestId: string | null;

	constructor(
		message: string,
		options: {
			status?: number | null;
			code?: ApiErrorCode | null;
			requestId?: string | null;
			cause?: unknown;
		} = {},
	) {
		super(message, { cause: options.cause });
		this.name = "ApiClientError";
		this.status = options.status ?? null;
		this.code = options.code ?? null;
		this.requestId = options.requestId ?? null;
	}
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
	return typeof value === "string" && value in apiErrorStatuses;
}

function isApiErrorBody(
	value: unknown,
): value is { code: ApiErrorCode; message: string } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const body = value as Record<string, unknown>;
	return isApiErrorCode(body.code) && typeof body.message === "string";
}

async function parseJson(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text === "") {
		throw new SyntaxError("Response body is empty.");
	}
	return JSON.parse(text) as unknown;
}

/**
 * API の JSON request/response を一元化する。成功レスポンスの runtime schema は
 * API 自身を信頼し、エラーボディだけを安全に検査する。
 */
export async function requestJson<TResponse>(
	path: string,
	init: RequestInit = {},
): Promise<TResponse> {
	let response: Response;
	try {
		const headers = new Headers(init.headers);
		if (!headers.has("accept")) {
			headers.set("accept", "application/json");
		}
		response = await fetch(path, {
			...init,
			headers,
			credentials: init.credentials ?? "same-origin",
		});
	} catch (cause) {
		throw new ApiClientError(DEFAULT_ERROR_MESSAGE, { cause });
	}

	const requestId = response.headers.get("x-request-id");
	let body: unknown;
	try {
		body = await parseJson(response);
	} catch (cause) {
		throw new ApiClientError(
			response.ok
				? "サーバーから有効なレスポンスを受け取れませんでした。"
				: apiErrorMessages.INTERNAL_SERVER_ERROR,
			{ status: response.status, requestId, cause },
		);
	}

	if (!response.ok) {
		if (isApiErrorBody(body)) {
			throw new ApiClientError(body.message, {
				status: response.status,
				code: body.code,
				requestId,
			});
		}

		throw new ApiClientError(apiErrorMessages.INTERNAL_SERVER_ERROR, {
			status: response.status,
			requestId,
		});
	}

	return body as TResponse;
}

export function isApiClientError(error: unknown): error is ApiClientError {
	return error instanceof ApiClientError;
}

export function isRetryableApiError(error: unknown): boolean {
	if (!isApiClientError(error)) {
		return true;
	}
	return error.status === null || error.status >= 500;
}
