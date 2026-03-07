import { defineConfig } from "drizzle-kit";

const databaseUrl =
	process.env.DATABASE_URL ??
	"postgres://user:password@localhost:5432/database";

export default defineConfig({
	out: "./drizzle",
	schema: "./app/db/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: databaseUrl,
	},
});
