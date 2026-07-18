import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "~/lib/env.server";

// process.env.DATABASE_URL は .env ファイル等から渡されます
// HMR 時にモジュール再読み込みで接続が増え続けるのを防ぐため、開発時は globalThis でシングルトン化
const globalForPostgres = globalThis as unknown as {
	postgresClient?: ReturnType<typeof postgres>;
};
const queryClient =
	globalForPostgres.postgresClient ??
	postgres(env.DATABASE_URL, {
		// 開発時は HMR での接続枯渇を防ぐため小さく、本番は並行リクエスト用に余裕を持たせる
		max: env.NODE_ENV === "production" ? 10 : 1,
	});
if (env.NODE_ENV !== "production") {
	globalForPostgres.postgresClient = queryClient;
}

export const db = drizzle(queryClient);
