import { createFileRoute } from "@tanstack/react-router";
import { dispatchPushNotifications } from "~/features/push/push-dispatch.service.server";
import { authenticateInternalJob } from "~/features/push/push-runtime.server";
import { handleApiRequest } from "~/lib/api/route";

export const Route = createFileRoute("/internal/jobs/push-dispatch")({
	server: {
		handlers: {
			POST: ({ request }) =>
				handleApiRequest({
					request,
					authenticate: async (authenticatedRequest) =>
						authenticateInternalJob(authenticatedRequest),
					handler: async () => dispatchPushNotifications(),
					successHeaders: { "cache-control": "no-store" },
				}),
		},
	},
});
