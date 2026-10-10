import { ApiClientError, requestJson } from "~/lib/api/client";
import { type ApiErrorCode, apiErrorMessages, apiErrorStatuses } from "~/lib/api/errors";
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

/** VAPID公開鍵のbase64url表現をPushManagerが受け取るバイト列へ変換する。 */
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

async function requestNoContent(
	path: string,
	init: RequestInit,
): Promise<void> {
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
		// Preserve the typed code for 409 ownership/limit and 429 rate errors.
		// Never trust or show arbitrary response text containing subscription data.
		const body: unknown = await response.json().catch(() => null);
		const rawCode = typeof body === "object" && body !== null && "code" in body
			? body.code : null;
		const code: ApiErrorCode | null =
			typeof rawCode === "string" && Object.hasOwn(apiErrorStatuses, rawCode)
				? rawCode as ApiErrorCode : null;
		throw new ApiClientError(
			code ? apiErrorMessages[code] : "通知設定の更新に失敗しました。",
			{
				status: response.status,
				code,
				requestId: response.headers.get("x-request-id"),
			},
		);
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
	signal?: AbortSignal,
): Promise<void> {
	return requestNoContent(NOTIFICATION_API_PATH, {
		method: "DELETE",
		signal,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}


/**
 * Revoke only this browser's subscription while still authenticated.
 * Always unsubscribe locally, including when the API is temporarily unreachable.
 * A failed API DELETE leaves a stale record until 404/410 cleanup.
 */
export async function releaseCurrentDevicePushSubscription(): Promise<void> {
	if (!isPushSupported()) return;
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();
	if (!subscription) return;
	try {
		await unregisterPushSubscription(
			{ endpoint: subscription.endpoint },
			AbortSignal.timeout(4_000),
		);
	} finally {
		await subscription.unsubscribe();
	}
}
