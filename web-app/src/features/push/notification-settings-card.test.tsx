import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "~/lib/api/client";
import { NotificationSettingsCard } from "./notification-settings-card";

const mocks = vi.hoisted(() => ({
	getNotificationSettings: vi.fn(),
	registerPushSubscription: vi.fn(),
	unregisterPushSubscription: vi.fn(),
	updateNotificationSettings: vi.fn(),
	getSubscription: vi.fn(),
	subscribe: vi.fn(),
}));

vi.mock("./push-notifications.browser", async (original) => ({
	...(await original<typeof import("./push-notifications.browser")>()),
	...mocks,
	isPushSupported: () => true,
}));

const settings = {
	enabled: false,
	notifyAt: "20:00",
	vapidPublicKey: "public-key",
};
let current: PushSubscription | null;

function subscription(suffix: string) {
	const endpoint = `https://fcm.googleapis.com/fcm/send/${suffix}`;
	return {
		endpoint,
		expirationTime: null,
		toJSON: () => ({ endpoint, keys: { p256dh: "public-key", auth: "auth" } }),
		unsubscribe: vi.fn(async () => {
			current = null;
			return true;
		}),
	} as unknown as PushSubscription;
}

async function start(onUnauthorized = vi.fn()) {
	render(<NotificationSettingsCard onUnauthorized={onUnauthorized} />);
	const button = await screen.findByRole("button", {
		name: "リマインダーをオンにする",
	});
	await userEvent.click(button);
	return button;
}

describe("NotificationSettingsCard registration", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		current = null;
		mocks.getNotificationSettings.mockResolvedValue(settings);
		mocks.updateNotificationSettings.mockResolvedValue({
			...settings,
			enabled: true,
		});
		mocks.getSubscription.mockImplementation(async () => current);
		mocks.subscribe.mockImplementation(async () => {
			current = subscription(crypto.randomUUID());
			return current;
		});
		vi.stubGlobal("Notification", {
			permission: "granted",
			requestPermission: vi.fn().mockResolvedValue("granted"),
		});
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: { ready: Promise.resolve({ pushManager: mocks }) },
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("新規登録と有効化に成功した購読を保持する", async () => {
		await start();
		await screen.findByText("リマインダーをオンにしました。");
		expect(mocks.registerPushSubscription).toHaveBeenCalledTimes(1);
		expect(mocks.unregisterPushSubscription).not.toHaveBeenCalled();
		expect(current?.unsubscribe).not.toHaveBeenCalled();
	});

	it("登録後の設定更新失敗ではサーバーとブラウザの新規購読を解除する", async () => {
		const fresh = subscription("fresh");
		mocks.subscribe.mockResolvedValue(fresh);
		mocks.updateNotificationSettings.mockRejectedValue(new Error("offline"));
		await start();
		await screen.findByRole("alert");
		expect(mocks.unregisterPushSubscription).toHaveBeenCalledWith(
			{ endpoint: fresh.endpoint },
			expect.any(AbortSignal),
		);
		expect(fresh.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it("PUTの応答喪失でも登録済みの可能性を考慮して両側を解除する", async () => {
		const fresh = subscription("lost-response");
		mocks.subscribe.mockResolvedValue(fresh);
		mocks.registerPushSubscription.mockRejectedValue(
			new ApiClientError("offline"),
		);
		await start();
		await screen.findByRole("alert");
		expect(mocks.unregisterPushSubscription).toHaveBeenCalledTimes(1);
		expect(fresh.unsubscribe).toHaveBeenCalledTimes(1);
		expect(mocks.updateNotificationSettings).not.toHaveBeenCalled();
	});

	it("既存購読を再利用した後の失敗では既存購読を削除しない", async () => {
		const existing = subscription("existing");
		current = existing;
		mocks.updateNotificationSettings.mockRejectedValue(new Error("offline"));
		await start();
		await screen.findByRole("alert");
		expect(mocks.subscribe).not.toHaveBeenCalled();
		expect(mocks.unregisterPushSubscription).not.toHaveBeenCalled();
		expect(existing.unsubscribe).not.toHaveBeenCalled();
	});

	it("PUT前のシリアライズ失敗ではブラウザだけを解除する", async () => {
		const fresh = subscription("serialization");
		fresh.toJSON = () => {
			throw new Error("serialization failed");
		};
		mocks.subscribe.mockResolvedValue(fresh);
		await start();
		await screen.findByRole("alert");
		expect(mocks.registerPushSubscription).not.toHaveBeenCalled();
		expect(mocks.unregisterPushSubscription).not.toHaveBeenCalled();
		expect(fresh.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it.each(["server", "browser"])(
		"%sのロールバック失敗を通知し再試行で復旧する",
		async (side) => {
			const fresh = subscription("rollback");
			mocks.subscribe.mockResolvedValueOnce(fresh);
			mocks.updateNotificationSettings.mockRejectedValueOnce(
				new Error("offline"),
			);
			if (side === "server") {
				mocks.unregisterPushSubscription.mockRejectedValueOnce(
					new Error("offline"),
				);
			} else {
				vi.mocked(fresh.unsubscribe).mockRejectedValueOnce(
					new Error("offline"),
				);
			}
			const button = await start();
			await screen.findByText(/通知登録の後片付けが完了していません/);
			expect(await screen.findByRole("alert")).toHaveTextContent(
				"通知を有効にできませんでした",
			);
			await userEvent.click(button);
			await screen.findByText("リマインダーをオンにしました。");
			expect(mocks.unregisterPushSubscription).toHaveBeenCalledTimes(
				side === "server" ? 2 : 1,
			);
			expect(fresh.unsubscribe).toHaveBeenCalledTimes(2);
			expect(mocks.registerPushSubscription).toHaveBeenCalledTimes(2);
		},
	);

	it("ロールバックに失敗しても元の401を処理する", async () => {
		const unauthorized = vi.fn();
		mocks.registerPushSubscription.mockRejectedValue(
			new ApiClientError("unauthorized", { status: 401 }),
		);
		mocks.unregisterPushSubscription.mockRejectedValue(new Error("offline"));
		await start(unauthorized);
		await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1));
	});

	it("他アカウントとの競合から新しい購読を作り直せる", async () => {
		const existing = subscription("other-account");
		current = existing;
		mocks.registerPushSubscription.mockRejectedValueOnce(
			new ApiClientError("conflict", {
				status: 409,
				code: "PUSH_SUBSCRIPTION_CONFLICT",
			}),
		);
		await start();
		await userEvent.click(
			await screen.findByRole("button", {
				name: "この端末の通知登録を作り直す",
			}),
		);
		await screen.findByText("リマインダーをオンにしました。");
		expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
		expect(mocks.unregisterPushSubscription).not.toHaveBeenCalled();
		expect(current?.endpoint).not.toBe(existing.endpoint);
	});
});
