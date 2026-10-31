import { afterEach, describe, expect, it, vi } from "vitest";
import {
	registerPushSubscription,
	releaseCurrentDevicePushSubscription,
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

function mockSupportedBrowser(unsubscribe: () => Promise<boolean>) {
	const subscription = {
		endpoint: "https://fcm.googleapis.com/fcm/send/token",
		unsubscribe: vi.fn(unsubscribe),
	};
	const getRegistration = vi.fn().mockResolvedValue({
		pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
	});
	vi.stubGlobal("window", {
		isSecureContext: true,
		PushManager: class {},
		Notification: { permission: "granted" },
	});
	vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
	return { subscription, getRegistration };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("current device push revocation", () => {
	it("logout前に本人のendpointだけDELETEし、ブラウザの購読も解除する", async () => {
		const { subscription } = mockSupportedBrowser(async () => true);
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);

		await releaseCurrentDevicePushSubscription();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/notifications",
			expect.objectContaining({
				method: "DELETE",
				body: JSON.stringify({ endpoint: subscription.endpoint }),
				credentials: "same-origin",
			}),
		);
		expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it("ネットワーク障害でもlocal unsubscribeを試み、サーバー削除失敗を隠さない", async () => {
		const { subscription } = mockSupportedBrowser(async () => true);
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		await expect(releaseCurrentDevicePushSubscription()).rejects.toMatchObject({
			name: "ApiClientError",
		});
		expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
	});
});

describe("Push registration API errors", () => {
	it("409エラーの具体的なコードをクライアントで受け取れる", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						code: "PUSH_SUBSCRIPTION_CONFLICT",
						message: "sensitive server text",
					}),
					{
						status: 409,
						headers: { "content-type": "application/json" },
					},
				),
			),
		);
		await expect(
			registerPushSubscription({
				endpoint: "https://fcm.googleapis.com/fcm/send/token",
				expirationTime: null,
				keys: { p256dh: "public-key", auth: "auth" },
			}),
		).rejects.toMatchObject({
			name: "ApiClientError",
			code: "PUSH_SUBSCRIPTION_CONFLICT",
			status: 409,
			message: "この端末の通知登録は別アカウントに紐づいています。",
		});
	});
});
