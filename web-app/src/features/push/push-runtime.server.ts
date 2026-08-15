import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "~/lib/api/errors";
import { env } from "~/lib/env.server";

export type PushRuntimeConfig = {
	publicKey: string;
	privateKey: string;
	subject: string;
};

function serviceUnavailable(message: string): never {
	throw new ApiError("INTERNAL_SERVER_ERROR", message, { status: 503 });
}

export function getPushRuntimeConfig(): PushRuntimeConfig {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
		return serviceUnavailable("Web Push の VAPID 設定が不足しています。");
	}
	return {
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY,
		subject: env.VAPID_SUBJECT,
	};
}

function hashToken(value: string): Buffer {
	return createHash("sha256").update(value, "utf8").digest();
}

export function authenticateInternalJob(request: Request): { id: string } | null {
	if (!env.INTERNAL_JOB_TOKEN) {
		return serviceUnavailable("内部job tokenが設定されていません。");
	}
	const supplied = request.headers.get("x-internal-job-token");
	if (!supplied) {
		return null;
	}
	return timingSafeEqual(hashToken(supplied), hashToken(env.INTERNAL_JOB_TOKEN))
		? { id: "notification-scheduler" }
		: null;
}
