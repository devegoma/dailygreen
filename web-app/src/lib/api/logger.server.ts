import { ApiError } from "./errors";

type ApiLogInput = {
	requestId: string;
	request: Request;
	startedAt: number;
	status: number;
	userId?: string;
	error?: unknown;
};

function serializeError(error: unknown): Record<string, unknown> | undefined {
	if (error === undefined) return undefined;
	if (error instanceof ApiError) {
		return {
			type: "api_error",
			code: error.code,
			status: error.status,
		};
	}

	return {
		type: "unexpected_error",
		message: "Unexpected error",
		errorId: crypto.randomUUID(),
	};
}

export function writeApiLog(input: ApiLogInput): void {
	try {
		const url = new URL(input.request.url);
		const entry = {
			type: "api_request",
			requestId: input.requestId,
			method: input.request.method,
			pathname: url.pathname,
			userId: input.userId,
			status: input.status,
			durationMs: Math.round(performance.now() - input.startedAt),
			error: serializeError(input.error),
		};
		const message = JSON.stringify(entry);
		if (input.status >= 500) console.error(message);
		else if (input.status >= 400) console.warn(message);
		else console.info(message);
	} catch {
		// ログ処理の失敗をAPIレスポンスへ波及させない。
	}
}
