import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	Object.assign(process.env, {
		NODE_ENV: "test",
		DATABASE_URL: "postgresql://user:password@localhost:5432/dailygreen",
		BETTER_AUTH_SECRET: "a".repeat(32),
		BETTER_AUTH_URL: "http://localhost:5173",
		GOOGLE_CLIENT_ID: "client-id",
		GOOGLE_CLIENT_SECRET: "client-secret",
	});
});

import { parseServerEnv } from "./env.server";

const validEnv = {
	NODE_ENV: "test",
	DATABASE_URL: "postgresql://user:password@localhost:5432/dailygreen",
	BETTER_AUTH_SECRET: "a".repeat(32),
	BETTER_AUTH_URL: "http://localhost:5173",
	GOOGLE_CLIENT_ID: "client-id",
	GOOGLE_CLIENT_SECRET: "client-secret",
};

describe("parseServerEnv", () => {
	it("有効なテスト環境変数を一元的に検証する", () => {
		expect(parseServerEnv(validEnv).NODE_ENV).toBe("test");
	});

	it("productionのHTTP認証URLを拒否する", () => {
		expect(() =>
			parseServerEnv({ ...validEnv, NODE_ENV: "production" }),
		).toThrow("HTTPS");
	});

	it("VITE_付きの秘密値を拒否する", () => {
		expect(() =>
			parseServerEnv({ ...validEnv, VITE_DATABASE_URL: validEnv.DATABASE_URL }),
		).toThrow("VITE_");
	});
});
