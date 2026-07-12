import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"~": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		globals: false,
		include: ["src/**/*.integration.test.ts"],
		fileParallelism: false,
		env: {
			NODE_ENV: "test",
			BETTER_AUTH_SECRET: "test-only-secret-test-only-secret-1234",
			BETTER_AUTH_URL: "http://localhost:5173",
			GOOGLE_CLIENT_ID: "test-google-client-id",
			GOOGLE_CLIENT_SECRET: "test-google-client-secret",
		},
	},
});
