import { describe, expect, it } from "vitest";
import {
	serializePushSubscription,
	urlBase64ToUint8Array,
} from "./push-notifications.browser";

describe("urlBase64ToUint8Array", () => {
	it("VAPIDのbase64url文字列をapplicationServerKeyへ変換する", () => {
		const bytes = urlBase64ToUint8Array("AQID-v8");
		expect([...bytes]).toEqual([1, 2, 3, 250, 255]);
	});
});

describe("serializePushSubscription", () => {
	it("ブラウザSubscriptionをAPI契約へ変換する", () => {
		const subscription = {
			expirationTime: 1_800_000_000_000,
			toJSON: () => ({
				endpoint: "https://push.example.test/subscription/abc",
				keys: { p256dh: "public-key", auth: "auth-secret" },
			}),
		} as unknown as PushSubscription;

		expect(serializePushSubscription(subscription)).toEqual({
			endpoint: "https://push.example.test/subscription/abc",
			expirationTime: 1_800_000_000_000,
			keys: { p256dh: "public-key", auth: "auth-secret" },
		});
	});

	it("必要な鍵が欠けたSubscriptionを拒否する", () => {
		const subscription = {
			expirationTime: null,
			toJSON: () => ({
				endpoint: "https://push.example.test/subscription/abc",
				keys: { p256dh: "public-key" },
			}),
		} as unknown as PushSubscription;

		expect(() => serializePushSubscription(subscription)).toThrow(
			"Push Subscriptionの情報を取得できませんでした。",
		);
	});
});
