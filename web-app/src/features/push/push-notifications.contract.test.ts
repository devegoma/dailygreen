import { describe, expect, it } from "vitest";
import { ApiError } from "~/lib/api/errors";
import {
	parseDeletePushSubscriptionRequest,
	parsePushSubscriptionRequest,
	parseUpdateNotificationSettingsRequest,
} from "./push-notifications.contract";

function expectInvalid(action: () => unknown) {
	try {
		action();
		throw new Error("INVALID_REQUESTが投げられませんでした");
	} catch (error) {
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).code).toBe("INVALID_REQUEST");
	}
}

describe("通知設定入力", () => {
	it("enabledとHH:MM形式の時刻を受け付ける", () => {
		expect(
			parseUpdateNotificationSettingsRequest({
				enabled: true,
				notifyAt: "20:30",
			}),
		).toEqual({ enabled: true, notifyAt: "20:30" });
	});

	it("未知フィールド・空object・不正時刻を拒否する", () => {
		expectInvalid(() => parseUpdateNotificationSettingsRequest({}));
		expectInvalid(() =>
			parseUpdateNotificationSettingsRequest({ enabled: true, extra: true }),
		);
		expectInvalid(() =>
			parseUpdateNotificationSettingsRequest({ notifyAt: "24:00" }),
		);
	});
});

describe("Push Subscription入力", () => {
	const valid = {
		endpoint: "https://push.example.test/subscription/abc",
		expirationTime: null,
		keys: { p256dh: "public-key", auth: "auth-secret" },
	};

	it("ブラウザのSubscription JSONを受け付ける", () => {
		expect(parsePushSubscriptionRequest(valid)).toEqual(valid);
	});

	it("expirationTimeのミリ秒値を受け付ける", () => {
		expect(
			parsePushSubscriptionRequest({ ...valid, expirationTime: 1_800_000_000_000 }),
		).toMatchObject({ expirationTime: 1_800_000_000_000 });
	});

	it("HTTPS以外・未知フィールド・不足した鍵を拒否する", () => {
		expectInvalid(() =>
			parsePushSubscriptionRequest({
				...valid,
				endpoint: "http://push.example.test/subscription/abc",
			}),
		);
		expectInvalid(() => parsePushSubscriptionRequest({ ...valid, extra: true }));
		expectInvalid(() =>
			parsePushSubscriptionRequest({ ...valid, keys: { p256dh: "public-key" } }),
		);
	});
});

describe("Subscription解除入力", () => {
	it("HTTPS endpointだけを受け付ける", () => {
		const endpoint = "https://push.example.test/subscription/abc";
		expect(parseDeletePushSubscriptionRequest({ endpoint })).toEqual({ endpoint });
		expectInvalid(() =>
			parseDeletePushSubscriptionRequest({ endpoint, extra: true }),
		);
	});
});
