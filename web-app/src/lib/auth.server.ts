import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oneTap } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "~/db/index.server";
import * as schema from "~/db/schema";
import { env } from "~/lib/env.server";

export const auth = betterAuth({
	plugins: [oneTap(), tanstackStartCookies()],
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			...schema,
		},
	}),
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	account: {
		encryptOAuthTokens: true,
	},
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
	},
	user: {
		additionalFields: {
			timezone: {
				type: "string",
				required: false,
				defaultValue: "Asia/Tokyo",
			},
		},
	},
});
