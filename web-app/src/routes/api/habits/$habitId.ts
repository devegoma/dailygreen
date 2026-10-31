import { createFileRoute } from "@tanstack/react-router";
import { updateHabit } from "~/features/habits/habits.service.server";
import { parseJsonBody } from "~/lib/api/request";
import { handleAuthenticatedApi } from "~/lib/api/route.server";

export const Route = createFileRoute("/api/habits/$habitId")({
	server: {
		handlers: {
			PATCH: ({ request, params }) =>
				handleAuthenticatedApi(
					request,
					async ({ request: authenticatedRequest, user }) => {
						const body = await parseJsonBody(authenticatedRequest);
						return updateHabit({ user, habitId: params.habitId, body });
					},
				),
		},
	},
});
