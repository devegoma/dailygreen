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
		expect(parseServerEnv(validEnv)).toMatchObject({
			NODE_ENV: "test",
			APP_VERSION: "development",
		});
	});

	it("Web Pushのruntime設定を検証して保持する", () => {
		expect(
			parseServerEnv({
				...validEnv,
				VAPID_PUBLIC_KEY: "public-key",
				VAPID_PRIVATE_KEY: "private-key",
				VAPID_SUBJECT: "mailto:admin@example.com",
				INTERNAL_JOB_TOKEN: "t".repeat(32),
			}),
		).toMatchObject({
			VAPID_PUBLIC_KEY: "public-key",
			VAPID_PRIVATE_KEY: "private-key",
			VAPID_SUBJECT: "mailto:admin@example.com",
			INTERNAL_JOB_TOKEN: "t".repeat(32),
		});
	});

	it("不正なVAPID subjectと短すぎる内部job tokenを拒否する", () => {
		expect(() =>
			parseServerEnv({ ...validEnv, VAPID_SUBJECT: "ftp://example.com" }),
		).toThrow("VAPID_SUBJECT");
		expect(() =>
			parseServerEnv({ ...validEnv, INTERNAL_JOB_TOKEN: "short" }),
		).toThrow("INTERNAL_JOB_TOKEN");
	});

	it("PostgreSQL以外のDATABASE_URLを拒否する", () => {
		expect(() =>
			parseServerEnv({
				...validEnv,
				DATABASE_URL: "https://example.com/database",
			}),
		).toThrow("PostgreSQL URL");
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
		expect(() =>
			parseServerEnv({ ...validEnv, VITE_VAPID_PRIVATE_KEY: "private" }),
		).toThrow("VITE_");
	});
});
