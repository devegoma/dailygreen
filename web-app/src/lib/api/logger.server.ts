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
	if (!(error instanceof Error))
		return error === undefined ? undefined : { value: String(error) };
	return {
		name: error.name,
		message: error.message,
		stack: error.stack,
		cause: error.cause instanceof Error ? error.cause.message : error.cause,
		...(error instanceof ApiError ? { apiErrorCode: error.code } : {}),
	};
}

export function writeApiLog(input: ApiLogInput): void {
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
}
