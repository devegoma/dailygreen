import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// process.env.DATABASE_URL は .env ファイル等から渡されます
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL is not set");
}

// HMR 時にモジュール再読み込みで接続が増え続けるのを防ぐため、開発時は globalThis でシングルトン化
const globalForPostgres = globalThis as unknown as {
	postgresClient: ReturnType<typeof postgres> | undefined;
};
const queryClient =
	globalForPostgres.postgresClient ??
	postgres(databaseUrl, {
		// 開発時は HMR での接続枯渇を防ぐため小さく、本番は並行リクエスト用に余裕を持たせる
		max: process.env.NODE_ENV === "production" ? 10 : 1,
	});
if (process.env.NODE_ENV !== "production") {
	globalForPostgres.postgresClient = queryClient;
}

export const db = drizzle(queryClient);
