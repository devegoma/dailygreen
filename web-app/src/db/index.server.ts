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
		// 開発時は HMR での接続枯渇を防ぐため小さく、本番と統合テストは並行処理を検証できる接続数にする
		max: env.NODE_ENV === "development" ? 1 : 10,
	});
if (env.NODE_ENV !== "production") {
	globalForPostgres.postgresClient = queryClient;
}

export const db = drizzle(queryClient);
