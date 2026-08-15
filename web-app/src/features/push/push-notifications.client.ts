import { ApiClientError, requestJson } from "~/lib/api/client";
import type {
	DeletePushSubscriptionRequest,
	NotificationSettingsResponse,
	PushSubscriptionRequest,
	UpdateNotificationSettingsRequest,
} from "./push-notifications.api-contract";

const NOTIFICATION_API_PATH = "/api/notifications";

export function isPushSupported(): boolean {
	return (
		typeof window !== "undefined" &&
		window.isSecureContext &&
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
	const decoded = atob(base64);
	const bytes = new Uint8Array(decoded.length);
	for (let index = 0; index < decoded.length; index += 1) {
		bytes[index] = decoded.charCodeAt(index);
	}
	return bytes;
}

export function serializePushSubscription(
	subscription: PushSubscription,
): PushSubscriptionRequest {
	const json = subscription.toJSON();
	const endpoint = json.endpoint;
	const p256dh = json.keys?.p256dh;
	const auth = json.keys?.auth;
	if (!endpoint || !p256dh || !auth) {
		throw new Error("Push Subscriptionの情報を取得できませんでした。");
	}
	return {
		endpoint,
		expirationTime: subscription.expirationTime,
		keys: { p256dh, auth },
	};
}

async function requestNoContent(path: string, init: RequestInit): Promise<void> {
	let response: Response;
	try {
		response = await fetch(path, {
			...init,
			credentials: init.credentials ?? "same-origin",
			headers: {
				accept: "application/json",
				...init.headers,
			},
		});
	} catch (cause) {
		throw new ApiClientError(
			"通信に失敗しました。接続を確認して再試行してください",
			{ cause },
		);
	}

	if (!response.ok) {
		throw new ApiClientError("通知設定の更新に失敗しました。", {
			status: response.status,
			requestId: response.headers.get("x-request-id"),
		});
	}
}

export function getNotificationSettings(): Promise<NotificationSettingsResponse> {
	return requestJson<NotificationSettingsResponse>(NOTIFICATION_API_PATH);
}

export function updateNotificationSettings(
	body: UpdateNotificationSettingsRequest,
): Promise<NotificationSettingsResponse> {
	return requestJson<NotificationSettingsResponse>(NOTIFICATION_API_PATH, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

export function registerPushSubscription(
	body: PushSubscriptionRequest,
): Promise<void> {
	return requestNoContent(NOTIFICATION_API_PATH, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

export function unregisterPushSubscription(
	body: DeletePushSubscriptionRequest,
): Promise<void> {
	return requestNoContent(NOTIFICATION_API_PATH, {
		method: "DELETE",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}
