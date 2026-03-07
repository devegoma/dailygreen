import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";

const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
if (!betterAuthSecret) {
	throw new Error("BETTER_AUTH_SECRET is not set");
}

const betterAuthUrl = process.env.BETTER_AUTH_URL;
if (!betterAuthUrl) {
	throw new Error("BETTER_AUTH_URL is not set");
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
if (!googleClientId) {
	throw new Error("GOOGLE_CLIENT_ID is not set");
}

const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!googleClientSecret) {
	throw new Error("GOOGLE_CLIENT_SECRET is not set");
}

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			...schema,
		},
	}),
	baseURL: betterAuthUrl,
	secret: betterAuthSecret,
	socialProviders: {
		google: {
			clientId: googleClientId,
			clientSecret: googleClientSecret,
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
