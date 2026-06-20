import { createFileRoute } from "@tanstack/react-router";
import { archiveHabit } from "~/features/habits/habits.service.server";
import { handleAuthenticatedApi } from "~/lib/api/route.server";

export const Route = createFileRoute("/api/habits/$habitId/archive")({
	server: {
		handlers: {
			PATCH: ({ request, params }) =>
				handleAuthenticatedApi(request, ({ user }) =>
					archiveHabit({ user, habitId: params.habitId }),
				),
		},
	},
});
