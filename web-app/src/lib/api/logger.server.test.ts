import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { writeApiLog } from "./logger.server";

const baseInput = {
	requestId: "123e4567-e89b-42d3-a456-426614174000",
	request: new Request("http://localhost/api/habits"),
	startedAt: performance.now(),
};

describe("writeApiLog", () => {
	it("想定外例外の機密情報・stack・causeをログへ記録しない", () => {
		const errorLog = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const cause: Record<string, unknown> = {
			token: "secret-access-token",
			value: 1n,
		};
		cause.self = cause;

		writeApiLog({
			...baseInput,
			status: 500,
			error: new Error("user@example.com", { cause }),
		});

		const message = String(errorLog.mock.calls[0]?.[0]);
		expect(message).not.toContain("user@example.com");
		expect(message).not.toContain("secret-access-token");
		expect(JSON.parse(message).error).toEqual({
			type: "unexpected_error",
			message: "Unexpected error",
			errorId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
		});
		errorLog.mockRestore();
	});

	it("ApiErrorはcodeとstatusだけをエラー情報として記録する", () => {
		const warnLog = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);

		writeApiLog({
			...baseInput,
			status: 400,
			error: new ApiError("INVALID_REQUEST", "secret-input-value"),
		});

		const message = String(warnLog.mock.calls[0]?.[0]);
		expect(message).not.toContain("secret-input-value");
		expect(JSON.parse(message).error).toEqual({
			type: "api_error",
			code: "INVALID_REQUEST",
			status: 400,
		});
		warnLog.mockRestore();
	});

	it("ログ出力が失敗しても例外を送出しない", () => {
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => {
			throw new Error("logger unavailable");
		});

		expect(() =>
			writeApiLog({
				...baseInput,
				status: 500,
				error: new Error("database unavailable"),
			}),
		).not.toThrow();
		errorLog.mockRestore();
	});
});
