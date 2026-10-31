import postgres from "postgres";
import { pushEndpointRejectionReason } from "../src/features/push/push-endpoint.ts";

// Read-only audit. Never emit endpoints, keys, raw errors, or DB credentials.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (process.argv.slice(2).some((arg) => arg !== "--ids")) {
	throw new Error("Usage: audit-push-subscriptions.mjs [--ids]");
}
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const counts = { eligible: 0, invalid_url: 0, unsupported_host: 0 };
try {
	for await (const page of client`SELECT id, endpoint FROM push_subscription ORDER BY id`.cursor(
		100,
	)) {
		for (const row of page) {
			const reason = pushEndpointRejectionReason(row.endpoint);
			counts[reason ?? "eligible"] += 1;
			if (reason && process.argv.includes("--ids")) {
				console.log(JSON.stringify({ id: row.id, reason }));
			}
		}
	}
	console.log(JSON.stringify({ type: "push_subscription_audit", ...counts }));
} catch {
	console.error("Push subscription audit failed");
	process.exitCode = 1;
} finally {
	await client.end();
}
