import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// process.env.DATABASE_URL は .env ファイル等から渡されます
// サーバーレス環境などを考慮し、コネクションプールなどを設定することも可能です
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL is not set");
}
const queryClient = postgres(databaseUrl);

export const db = drizzle(queryClient);
