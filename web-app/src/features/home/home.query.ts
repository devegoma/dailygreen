import {
	CancelledError,
	isCancelledError,
	type QueryClient,
	queryOptions,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, isRetryableApiError } from "~/lib/api/client";
import { getHomeData } from "./home.api-client";

export const homeQueryKey = ["home"] as const;

// A response started before a home mutation must not overwrite newer mutation
// data if its AbortSignal is ignored by the transport.
const homeRequestRevisions = new WeakMap<QueryClient, number>();
const homeSuccessfulFetches = new WeakMap<
	QueryClient,
	{ sequence: number; revision: number }
>();

function currentHomeRequestRevision(queryClient: QueryClient): number {
	return homeRequestRevisions.get(queryClient) ?? 0;
}

/** 進行中の古い GET 応答を採用しないための世代を進める。 */
export function preventStaleHomeResponses(queryClient: QueryClient): number {
	const revision = currentHomeRequestRevision(queryClient) + 1;
	homeRequestRevisions.set(queryClient, revision);
	return revision;
}

function currentHomeSuccessfulFetch(queryClient: QueryClient): {
	sequence: number;
	revision: number;
} {
	return (
		homeSuccessfulFetches.get(queryClient) ?? { sequence: 0, revision: -1 }
	);
}

function recordHomeSuccessfulFetch(
	queryClient: QueryClient,
	revision: number,
): void {
	homeSuccessfulFetches.set(queryClient, {
		sequence: currentHomeSuccessfulFetch(queryClient).sequence + 1,
		revision,
	});
}

export type HomeQueryConfig = {
	enabled: boolean;
	onUnauthorized?: () => void | Promise<void>;
};

export function homeQueryOptions(
	{ enabled }: HomeQueryConfig,
	queryClient?: QueryClient,
) {
	return queryOptions({
		queryKey: homeQueryKey,
		enabled,
		staleTime: 0,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: (failureCount, error) =>
			failureCount < 1 &&
			!isCancelledError(error) &&
			isRetryableApiError(error),
		queryFn: async ({ signal }) => {
			const revision = queryClient
				? currentHomeRequestRevision(queryClient)
				: undefined;
			const home = await getHomeData(signal);
			if (queryClient && revision !== currentHomeRequestRevision(queryClient)) {
				// 古い GET を破棄しても、mutation が直前に patch した cache を
				// revert してはならない。
				throw new CancelledError({ revert: false, silent: true });
			}
			if (queryClient) {
				recordHomeSuccessfulFetch(queryClient, revision ?? 0);
			}
			return home;
		},
	});
}

/** 明示ログアウト・401・セッション切替時に呼び、ユーザー間の表示漏えいを防ぐ。 */
export async function clearHomeCache(queryClient: QueryClient): Promise<void> {
	await queryClient.cancelQueries({ queryKey: homeQueryKey });
	queryClient.removeQueries({ queryKey: homeQueryKey });
}

/** create / edit / archive 後にサーバーのホーム状態を取り直す。 */
export async function invalidateAndRefetchHome(
	queryClient: QueryClient,
): Promise<boolean> {
	const successfulFetch = currentHomeSuccessfulFetch(queryClient);
	const expectedRevision = preventStaleHomeResponses(queryClient);
	await queryClient.invalidateQueries({
		queryKey: homeQueryKey,
		refetchType: "none",
	});

	// observer がなく GET を発行していないケースは再同期済みとみなさない。
	const activeHomeQueries = queryClient
		.getQueryCache()
		.findAll({ queryKey: homeQueryKey, exact: true })
		.filter((query) => query.isActive());
	try {
		await queryClient.refetchQueries(
			{ queryKey: homeQueryKey, type: "active" },
			{ throwOnError: true },
		);
		// refetchQueries は cancel された fetch でも resolve しうる。local の
		// setQueryData では増えない、世代一致GETの完了sequenceで同期を判定する。
		return (
			activeHomeQueries.length > 0 &&
			currentHomeSuccessfulFetch(queryClient).sequence >
				successfulFetch.sequence &&
			currentHomeSuccessfulFetch(queryClient).revision === expectedRevision
		);
	} catch {
		return false;
	}
}

/**
 * useSession の user.id を渡して使う。identity が変わる瞬間は query data を隠し、
 * 古いユーザーの home を新しいユーザーに表示しない。
 */
export function useHomeQuery(config: HomeQueryConfig & { userId?: string }) {
	const queryClient = useQueryClient();
	const [readyUserId, setReadyUserId] = useState(config.userId);
	const previousUserId = useRef(config.userId);
	const identityChanged = previousUserId.current !== config.userId;

	useEffect(() => {
		if (!identityChanged) {
			return;
		}

		let cancelled = false;
		previousUserId.current = config.userId;
		void clearHomeCache(queryClient).then(() => {
			if (!cancelled) {
				setReadyUserId(config.userId);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [config.userId, identityChanged, queryClient]);

	const onUnauthorized = useCallback(async () => {
		await clearHomeCache(queryClient);
		await config.onUnauthorized?.();
	}, [config.onUnauthorized, queryClient]);
	const query = useQuery(
		homeQueryOptions(
			{
				enabled:
					config.enabled && readyUserId === config.userId && !identityChanged,
			},
			queryClient,
		),
	);
	const handledUnauthorizedError = useRef<unknown>(undefined);

	useEffect(() => {
		if (
			!(query.error instanceof ApiClientError) ||
			query.error.status !== 401 ||
			handledUnauthorizedError.current === query.error
		) {
			return;
		}

		// queryFn 内で cache を削除すると、401 が observer に届く前に query 自体を
		// 取り除いてしまう。描画後の effect でセッションを再確認する。
		handledUnauthorizedError.current = query.error;
		void onUnauthorized().catch(() => {
			// UI は元の ApiClientError を見て未認証状態へ遷移できる。
		});
	}, [onUnauthorized, query.error]);

	if (readyUserId !== config.userId || identityChanged) {
		return { ...query, data: undefined };
	}
	return query;
}
