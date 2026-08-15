import { createFileRoute } from "@tanstack/react-router";
import {
	deletePushSubscription,
	getNotificationSettings,
	updateNotificationSettings,
	upsertPushSubscription,
} from "~/features/push/push-notifications.service.server";
import { parseJsonBody } from "~/lib/api/request";
import { handleAuthenticatedApi } from "~/lib/api/route.server";

export const Route = createFileRoute("/api/notifications")({
	server: {
		handlers: {
			GET: ({ request }) =>
				handleAuthenticatedApi(
					request,
					async ({ user }) => getNotificationSettings(user),
					{ successHeaders: { "cache-control": "no-store" } },
				),
			PATCH: ({ request }) =>
				handleAuthenticatedApi(request, async ({ request: authenticatedRequest, user }) =>
					updateNotificationSettings({
						user,
						body: await parseJsonBody(authenticatedRequest),
					}),
				),
			PUT: ({ request }) =>
				handleAuthenticatedApi(request, async ({ request: authenticatedRequest, user }) => {
					await upsertPushSubscription({
						user,
						body: await parseJsonBody(authenticatedRequest),
					});
					return new Response(null, { status: 204 });
				}),
			DELETE: ({ request }) =>
				handleAuthenticatedApi(request, async ({ request: authenticatedRequest, user }) => {
					await deletePushSubscription({
						user,
						body: await parseJsonBody(authenticatedRequest),
					});
					return new Response(null, { status: 204 });
				}),
		},
	},
});
