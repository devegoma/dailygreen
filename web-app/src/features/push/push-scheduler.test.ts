// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
	new URL("../../../../notification-scheduler/index.mjs", import.meta.url),
	"utf8",
);

function scheduler(
	timeout?: string,
	fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }),
) {
	const setTimeout = vi.fn();
	const log = vi.fn();
	const timeoutSignal = vi.fn(() => new AbortController().signal);
	const result = runInNewContext(`(async () => { ${source}\n })()`, {
		process: {
			env: {
				INTERNAL_JOB_URL: "http://web/internal/jobs/push-dispatch",
				INTERNAL_JOB_TOKEN: "test-only-token",
				SCHEDULER_TIMEOUT_MS: timeout,
			},
			on: vi.fn(),
		},
		fetch,
		URL,
		AbortSignal: { timeout: timeoutSignal },
		console: { log },
		setTimeout,
		clearTimeout: vi.fn(),
	});
	return { result, fetch, setTimeout, log, timeoutSignal };
}

describe("notification scheduler", () => {
	it("65秒のジョブより長い75秒を待ち完了後60秒で次回を予約する", async () => {
		let complete: (value: unknown) => void = () => {};
		const fetch = vi.fn(
			() =>
				new Promise((resolve) => {
					complete = resolve;
				}),
		);
		const instance = scheduler(undefined, fetch);
		expect(instance.timeoutSignal).toHaveBeenCalledWith(75_000);
		expect(instance.setTimeout).not.toHaveBeenCalled();
		complete({ ok: true, status: 200 });
		await instance.result;
		expect(instance.setTimeout).toHaveBeenCalledWith(
			expect.any(Function),
			60_000,
		);
	});

	it("サーバーより先に切れる古い30秒設定を起動時に拒否する", async () => {
		const instance = scheduler("30000");
		await expect(instance.result).rejects.toThrow("must be at least 75000");
		expect(instance.fetch).not.toHaveBeenCalled();
	});

	it("HTTP abort後に即時再送せず通常周期を維持する", async () => {
		const instance = scheduler(
			undefined,
			vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
		);
		await instance.result;
		expect(instance.fetch).toHaveBeenCalledTimes(1);
		expect(instance.setTimeout).toHaveBeenCalledWith(
			expect.any(Function),
			60_000,
		);
	});

	it("エラー応答のURLや鍵を含み得るbodyをログ出力しない", async () => {
		const text = vi
			.fn()
			.mockResolvedValue("https://sensitive.example/endpoint key-secret");
		const instance = scheduler(
			undefined,
			vi.fn().mockResolvedValue({ ok: false, status: 500, text }),
		);
		await instance.result;
		expect(text).not.toHaveBeenCalled();
		expect(JSON.stringify(instance.log.mock.calls)).not.toMatch(
			/sensitive|key-secret/,
		);
	});
});
