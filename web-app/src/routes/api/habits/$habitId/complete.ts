import { createFileRoute } from "@tanstack/react-router";
import { completeHabit } from "~/features/habits/habits.service.server";
import { handleAuthenticatedApi } from "~/lib/api/route.server";

export const Route = createFileRoute("/api/habits/$habitId/complete")({
	server: {
		handlers: {
			POST: ({ request, params }) =>
				handleAuthenticatedApi(
					request,
					({ user }) => completeHabit({ user, habitId: params.habitId }),
					{ successStatus: 201 },
				),
		},
	},
});
