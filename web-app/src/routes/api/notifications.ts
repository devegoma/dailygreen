import { createFileRoute } from "@tanstack/react-router";
import {
	deletePushSubscription,
	getNotificationSettings,
	updateNotificationSettings,
	upsertPushSubscription,
} from "~/features/push/push-notifications.service.server";
import { ApiError, jsonResponse } from "~/lib/api/errors";
import { runAuthenticatedApiRoute } from "~/lib/api/route.server";

async function readJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch (error) {
		throw new ApiError("INVALID_REQUEST", undefined, { cause: error });
	}
}

export const Route = createFileRoute("/api/notifications")({
	server: {
		handlers: {
			GET: ({ request }) =>
				runAuthenticatedApiRoute({
					request,
					operation: "notifications.get",
					execute: async ({ user }) =>
						jsonResponse(await getNotificationSettings(user), {
							headers: { "cache-control": "no-store" },
						}),
				}),
			PATCH: ({ request }) =>
				runAuthenticatedApiRoute({
					request,
					operation: "notifications.update",
					execute: async ({ user }) =>
						jsonResponse(
							await updateNotificationSettings({
								user,
								body: await readJsonBody(request),
							}),
						),
				}),
			PUT: ({ request }) =>
				runAuthenticatedApiRoute({
					request,
					operation: "notifications.subscription.upsert",
					execute: async ({ user }) => {
						await upsertPushSubscription({
							user,
							body: await readJsonBody(request),
						});
						return new Response(null, { status: 204 });
					},
				}),
			DELETE: ({ request }) =>
				runAuthenticatedApiRoute({
					request,
					operation: "notifications.subscription.delete",
					execute: async ({ user }) => {
						await deletePushSubscription({
							user,
							body: await readJsonBody(request),
						});
						return new Response(null, { status: 204 });
					},
				}),
		},
	},
});
