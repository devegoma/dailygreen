// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("~/db/index.server", () => ({ db: mocks }));
vi.mock("./push-runtime.server", () => ({
	getPushRuntimeConfig: () => ({
		subject: "mailto:test@example.com",
		publicKey: "public",
		privateKey: "private",
	}),
}));

import { dispatchPushNotifications } from "./push-dispatch.service.server";

describe("dispatchPushNotifications deadline", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.resetAllMocks();
	});
	it("DB接続取得が停滞してもジョブ全体の65秒期限で終了し送信しない", async () => {
		vi.useFakeTimers();
		mocks.transaction.mockImplementation(() => new Promise(() => {}));
		const sendPush = vi.fn();
		const result = dispatchPushNotifications({ sendPush });
		const assertion = expect(result).rejects.toMatchObject({
			name: "TimeoutError",
		});
		await vi.advanceTimersByTimeAsync(65_000);
		await assertion;
		expect(sendPush).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
});
