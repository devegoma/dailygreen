import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "~/lib/api/errors";
import { env } from "~/lib/env.server";

export const Route = createFileRoute("/health/live")({
	server: {
		handlers: {
			GET: () => jsonResponse({ status: "ok", version: env.APP_VERSION }),
		},
	},
});
