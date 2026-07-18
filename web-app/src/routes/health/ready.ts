import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { db } from "~/db/index.server";
import { jsonResponse } from "~/lib/api/errors";
import { env } from "~/lib/env.server";

export const Route = createFileRoute("/health/ready")({
	server: {
		handlers: {
			GET: async () => {
				try {
					await db.execute(
						sql`select 1 from "drizzle"."__drizzle_migrations" limit 1`,
					);
					return jsonResponse({ status: "ready", version: env.APP_VERSION });
				} catch {
					return jsonResponse(
						{ status: "not_ready", version: env.APP_VERSION },
						{ status: 503 },
					);
				}
			},
		},
	},
});
