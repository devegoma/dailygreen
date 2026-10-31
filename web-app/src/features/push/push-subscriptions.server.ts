import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { db } from "~/db/index.server";
import { pushSubscription } from "~/db/schema";
import { pushEndpointRejectionReason } from "./push-endpoint";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Rejected legacy records are inactive under the current policy, not deleted.
 * This preserves subscriptions if a vendor adds a legitimate new hostname.
 * Filter BEFORE the cap/budget, using bounded pages and a stable cursor.
 */
export async function getEligiblePushSubscriptions(
	tx: Transaction,
	userId: string,
	limit: number,
	signal?: AbortSignal,
) {
	const selected = [];
	const rejected = { invalid_url: 0, unsupported_host: 0 };
	let cursor: { updatedAtCursor: string; id: string } | undefined;
	while (selected.length < limit) {
		signal?.throwIfAborted();
		const page = await tx
			.select({
				...getTableColumns(pushSubscription),
				// Preserve PostgreSQL microseconds across pagination and cleanup.
				updatedAtCursor: sql<string>`${pushSubscription.updatedAt}::text`,
			})
			.from(pushSubscription)
			.where(
				and(
					eq(pushSubscription.userId, userId),
					cursor
						? sql`(${pushSubscription.updatedAt}, ${pushSubscription.id}) < (${cursor.updatedAtCursor}::timestamptz, ${cursor.id}::uuid)`
						: undefined,
				),
			)
			.orderBy(desc(pushSubscription.updatedAt), desc(pushSubscription.id))
			.limit(100);
		signal?.throwIfAborted();
		for (const subscription of page) {
			const reason = pushEndpointRejectionReason(subscription.endpoint);
			if (reason) rejected[reason] += 1;
			else selected.push(subscription);
			if (selected.length === limit) break;
		}
		cursor = page.at(-1);
		if (page.length < 100) break;
	}
	return { subscriptions: selected, rejected };
}
