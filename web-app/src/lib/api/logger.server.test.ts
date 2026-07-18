import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { writeApiLog } from "./logger.server";

const baseInput = {
	requestId: "123e4567-e89b-42d3-a456-426614174000",
	request: new Request("http://localhost/api/habits"),
	startedAt: performance.now(),
};

describe("writeApiLog", () => {
	it("想定外例外の機密情報を除外し、検証済みの識別子とstack frameを記録する", () => {
		const errorLog = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const cause: Record<string, unknown> = {
			token: "secret-access-token",
			value: 1n,
		};
		cause.self = cause;
		const error = new Error("user@example.com\nat secret-access-token", {
			cause,
		}) as Error & { code: string };
		error.name = "PostgresError";
		error.code = "ECONNREFUSED";

		writeApiLog({
			...baseInput,
			status: 500,
			error,
		});

		const message = String(errorLog.mock.calls[0]?.[0]);
		expect(message).not.toContain("user@example.com");
		expect(message).not.toContain("secret-access-token");
		expect(JSON.parse(message).error).toMatchObject({
			type: "unexpected_error",
			name: "PostgresError",
			code: "ECONNREFUSED",
		});
		expect(JSON.parse(message).error.stackFrames).toEqual(
			expect.arrayContaining([expect.stringContaining("logger.server.test")]),
		);
		errorLog.mockRestore();
	});

	it("stack frameを10件・各300文字に制限する", () => {
		const errorLog = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const error = new Error("secret-message");
		error.stack = [
			"Error: secret-message",
			...Array.from(
				{ length: 12 },
				(_, index) =>
					`    at handler${index} (/app/.output/server/chunks/routes.mjs:${index + 1}:1${"0".repeat(320)})`,
			),
		].join("\n");

		writeApiLog({ ...baseInput, status: 500, error });

		const message = String(errorLog.mock.calls[0]?.[0]);
		const stackFrames = JSON.parse(message).error.stackFrames as string[];
		expect(message).not.toContain("secret-message");
		expect(stackFrames).toHaveLength(10);
		expect(stackFrames.every((frame) => frame.length <= 300)).toBe(true);
		errorLog.mockRestore();
	});

	it("不正な例外名とコードをログへ記録しない", () => {
		const errorLog = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const error = new Error("hidden") as Error & { code: string };
		error.name = "Invalid Error Name";
		error.code = "secret/value";

		writeApiLog({ ...baseInput, status: 500, error });

		const serializedError = JSON.parse(
			String(errorLog.mock.calls[0]?.[0]),
		).error;
		expect(serializedError.name).toBe("Error");
		expect(serializedError).not.toHaveProperty("code");
		errorLog.mockRestore();
	});

	it("Error以外のthrow値は固定の例外名で記録する", () => {
		const errorLog = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		writeApiLog({ ...baseInput, status: 500, error: "secret-value" });

		const message = String(errorLog.mock.calls[0]?.[0]);
		expect(message).not.toContain("secret-value");
		expect(JSON.parse(message).error).toEqual({
			type: "unexpected_error",
			name: "UnknownThrownValue",
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
