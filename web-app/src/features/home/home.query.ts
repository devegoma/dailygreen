import {
	type QueryClient,
	queryOptions,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, isRetryableApiError } from "~/lib/api/client";
import { getHomeData } from "./home.api-client";

export const homeQueryKey = ["home"] as const;

export type HomeQueryConfig = {
	enabled: boolean;
	onUnauthorized?: () => void | Promise<void>;
};

export function homeQueryOptions({ enabled, onUnauthorized }: HomeQueryConfig) {
	return queryOptions({
		queryKey: homeQueryKey,
		enabled,
		staleTime: 0,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: (failureCount, error) =>
			failureCount < 1 && isRetryableApiError(error),
		queryFn: async ({ signal }) => {
			try {
				return await getHomeData(signal);
			} catch (error) {
				if (error instanceof ApiClientError && error.status === 401) {
					// セッション更新の失敗で、API が返した 401 を別のエラーに置き換えない。
					try {
						await onUnauthorized?.();
					} catch {
						// UI は元の ApiClientError を見て未認証状態へ遷移できる。
					}
				}
				throw error;
			}
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
	await queryClient.invalidateQueries({
		queryKey: homeQueryKey,
		refetchType: "none",
	});

	// observer がなく GET を発行していないケースは再同期済みとみなさない。
	const hasActiveHomeQuery = queryClient
		.getQueryCache()
		.findAll({ queryKey: homeQueryKey, exact: true })
		.some((query) => query.isActive());
	try {
		await queryClient.refetchQueries(
			{ queryKey: homeQueryKey, type: "active" },
			{ throwOnError: true },
		);
		return hasActiveHomeQuery;
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
		homeQueryOptions({
			enabled:
				config.enabled && readyUserId === config.userId && !identityChanged,
			onUnauthorized,
		}),
	);

	if (readyUserId !== config.userId || identityChanged) {
		return { ...query, data: undefined };
	}
	return query;
}
