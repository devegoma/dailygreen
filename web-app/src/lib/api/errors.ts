export const apiErrorStatuses = {
	UNAUTHORIZED: 401,
	HABIT_NOT_FOUND: 404,
	INVALID_REQUEST: 400,
	HABIT_ARCHIVED: 409,
	HABIT_ALREADY_COMPLETED_TODAY: 409,
	HABIT_LIMIT_EXCEEDED: 409,
	INTERNAL_SERVER_ERROR: 500,
} as const;

export const apiErrorMessages = {
	UNAUTHORIZED: "ログインが必要です。",
	HABIT_NOT_FOUND: "習慣が見つかりません。",
	INVALID_REQUEST: "リクエスト内容が不正です。",
	HABIT_ARCHIVED: "この習慣はアーカイブ済みです。",
	HABIT_ALREADY_COMPLETED_TODAY: "この習慣は本日すでに達成済みです。",
	HABIT_LIMIT_EXCEEDED: "習慣の登録上限に達しています。",
	INTERNAL_SERVER_ERROR: "サーバー内部でエラーが発生しました。",
} as const satisfies Record<ApiErrorCode, string>;

export type ApiErrorCode = keyof typeof apiErrorStatuses;

export type ApiErrorBody = {
	code: ApiErrorCode;
	message: string;
};

export class ApiError extends Error {
	readonly code: ApiErrorCode;
	readonly status: number;

	constructor(
		code: ApiErrorCode,
		message: string = apiErrorMessages[code],
		options: { status?: number; cause?: unknown } = {},
	) {
		super(message, { cause: options.cause });
		this.name = "ApiError";
		this.code = code;
		this.status = options.status ?? apiErrorStatuses[code];
	}
}

export function jsonResponse<TBody>(
	body: TBody,
	init: ResponseInit = {},
): Response {
	const headers = new Headers(init.headers);
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/json; charset=utf-8");
	}

	return new Response(JSON.stringify(body), {
		...init,
		headers,
	});
}

export function apiErrorResponse(error: unknown): Response {
	const apiError =
		error instanceof ApiError
			? error
			: new ApiError("INTERNAL_SERVER_ERROR", undefined, { cause: error });

	return jsonResponse<ApiErrorBody>(
		{
			code: apiError.code,
			message: apiError.message,
		},
		{ status: apiError.status },
	);
}

export function notImplementedApiError(operation: string): ApiError {
	return new ApiError(
		"INTERNAL_SERVER_ERROR",
		`${operation} の業務ロジックは未実装です。`,
	);
}
