import { ApiError } from "./errors";

type ApiLogInput = {
	requestId: string;
	request: Request;
	startedAt: number;
	status: number;
	userId?: string;
	error?: unknown;
};

const identifierPattern = /^[A-Za-z0-9_.:-]{1,64}$/;
const stackFramePattern = /^at [A-Za-z0-9_.$/:()<>[\]\\ -]+$/;
const maxStackFrames = 10;
const maxStackFrameLength = 300;

function safeIdentifier(value: unknown): string | undefined {
	return typeof value === "string" && identifierPattern.test(value)
		? value
		: undefined;
}

function safeStackFrames(error: Error): string[] | undefined {
	const messageLines = new Set(
		error.message.split(/\r?\n/).map((line) => line.trim()),
	);
	const frames = error.stack
		?.split(/\r?\n/)
		.slice(1)
		.map((line) => line.trim())
		.filter(
			(line) =>
				line.startsWith("at ") &&
				!messageLines.has(line) &&
				stackFramePattern.test(line.slice(0, maxStackFrameLength)),
		)
		.slice(0, maxStackFrames)
		.map((line) => line.slice(0, maxStackFrameLength));

	return frames && frames.length > 0 ? frames : undefined;
}

function serializeError(error: unknown): Record<string, unknown> | undefined {
	if (error === undefined) return undefined;
	if (error instanceof ApiError) {
		return {
			type: "api_error",
			code: error.code,
			status: error.status,
		};
	}
	if (error instanceof Error) {
		return {
			type: "unexpected_error",
			name: safeIdentifier(error.name) ?? "Error",
			code: safeIdentifier((error as Error & { code?: unknown }).code),
			stackFrames: safeStackFrames(error),
		};
	}

	return {
		type: "unexpected_error",
		name: "UnknownThrownValue",
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
