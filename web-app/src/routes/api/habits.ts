import { createFileRoute } from "@tanstack/react-router";
import { createHabit } from "~/features/habits/habits.service.server";
import { parseJsonBody } from "~/lib/api/request";
import { handleAuthenticatedApi } from "~/lib/api/route.server";

export const Route = createFileRoute("/api/habits")({
	server: {
		handlers: {
			POST: ({ request }) =>
				handleAuthenticatedApi(
					request,
					async ({ request: authenticatedRequest, user }) => {
						const body = await parseJsonBody(authenticatedRequest);
						return createHabit({ user, body });
					},
					{ successStatus: 201 },
				),
		},
	},
});
