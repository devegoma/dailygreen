import { ApiError } from "~/lib/api/errors";
import type {
	DeletePushSubscriptionRequest,
	PushSubscriptionRequest,
	UpdateNotificationSettingsRequest,
} from "./push-notifications.api-contract";

const settingsFields = new Set(["enabled", "notifyAt"]);
const subscriptionFields = new Set(["endpoint", "expirationTime", "keys"]);
const subscriptionKeyFields = new Set(["p256dh", "auth"]);
const deleteSubscriptionFields = new Set(["endpoint"]);
const notifyAtPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function invalidRequest(cause?: unknown): never {
	throw new ApiError("INVALID_REQUEST", undefined, { cause });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEndpoint(value: unknown): string {
	if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
		return invalidRequest();
	}
	try {
		const url = new URL(value);
		if (url.protocol !== "https:") {
			return invalidRequest();
		}
	} catch (error) {
		return invalidRequest(error);
	}
	return value;
}

function parseKey(value: unknown): string {
	if (typeof value !== "string" || value.length === 0 || value.length > 512) {
		return invalidRequest();
	}
	return value;
}

export function parseUpdateNotificationSettingsRequest(
	body: unknown,
): UpdateNotificationSettingsRequest {
	if (!isJsonObject(body)) {
		return invalidRequest();
	}
	const fields = Object.keys(body);
	if (
		fields.length === 0 ||
		fields.some((field) => !settingsFields.has(field))
	) {
		return invalidRequest();
	}

	const request: UpdateNotificationSettingsRequest = {};
	if ("enabled" in body) {
		if (typeof body.enabled !== "boolean") {
			return invalidRequest();
		}
		request.enabled = body.enabled;
	}
	if ("notifyAt" in body) {
		if (
			typeof body.notifyAt !== "string" ||
			!notifyAtPattern.test(body.notifyAt)
		) {
			return invalidRequest();
		}
		request.notifyAt = body.notifyAt;
	}
	return request;
}

export function parsePushSubscriptionRequest(
	body: unknown,
): PushSubscriptionRequest {
	if (!isJsonObject(body)) {
		return invalidRequest();
	}
	if (Object.keys(body).some((field) => !subscriptionFields.has(field))) {
		return invalidRequest();
	}
	if (!isJsonObject(body.keys)) {
		return invalidRequest();
	}
	if (
		Object.keys(body.keys).some((field) => !subscriptionKeyFields.has(field))
	) {
		return invalidRequest();
	}

	const expirationTime = body.expirationTime;
	if (
		expirationTime !== null &&
		(typeof expirationTime !== "number" ||
			!Number.isSafeInteger(expirationTime) ||
			expirationTime <= 0)
	) {
		return invalidRequest();
	}

	return {
		endpoint: parseEndpoint(body.endpoint),
		expirationTime,
		keys: {
			p256dh: parseKey(body.keys.p256dh),
			auth: parseKey(body.keys.auth),
		},
	};
}

export function parseDeletePushSubscriptionRequest(
	body: unknown,
): DeletePushSubscriptionRequest {
	if (!isJsonObject(body)) {
		return invalidRequest();
	}
	const fields = Object.keys(body);
	if (
		fields.length !== 1 ||
		fields.some((field) => !deleteSubscriptionFields.has(field))
	) {
		return invalidRequest();
	}
	return { endpoint: parseEndpoint(body.endpoint) };
}
