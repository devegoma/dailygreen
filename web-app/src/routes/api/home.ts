import { createFileRoute } from "@tanstack/react-router";
import { getHomeData } from "~/features/home/home.service.server";
import { handleAuthenticatedApi } from "~/lib/api/route.server";

export const Route = createFileRoute("/api/home")({
	server: {
		handlers: {
			GET: ({ request }) =>
				handleAuthenticatedApi(request, ({ user }) => getHomeData({ user }), {
					successHeaders: { "cache-control": "no-store" },
				}),
		},
	},
});
