import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { invalidateAndRefetchHome } from "./home.query";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function millisecondsUntilNextJstMidnight(now = new Date()): number {
	const jst = new Date(now.getTime() + JST_OFFSET_MS);
	const nextMidnight =
		Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + 1) -
		JST_OFFSET_MS;
	return Math.max(1, nextMidnight - now.getTime());
}

type TimeoutId = ReturnType<typeof globalThis.setTimeout>;

type TimeoutApi = {
	setTimeout: (callback: () => void, delay: number) => TimeoutId;
	clearTimeout: (id: TimeoutId) => void;
};

/** 次の JST 00:00 ごとに処理し、完了後に翌日の timer を予約する。 */
export function scheduleJstMidnightRefresh(
	onMidnight: () => void | Promise<void>,
	options: { now?: () => Date; timers?: TimeoutApi } = {},
): () => void {
	const now = options.now ?? (() => new Date());
	const timers: TimeoutApi = options.timers ?? {
		setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
		clearTimeout: (id) => globalThis.clearTimeout(id),
	};
	let disposed = false;
	let timerId: TimeoutId | undefined;

	const schedule = () => {
		timerId = timers.setTimeout(() => {
			const reschedule = () => {
				if (!disposed) {
					schedule();
				}
			};
			void Promise.resolve(onMidnight()).then(reschedule, reschedule);
		}, millisecondsUntilNextJstMidnight(now()));
	};

	schedule();
	return () => {
		disposed = true;
		if (timerId !== undefined) {
			timers.clearTimeout(timerId);
		}
	};
}

/** client clock は再取得時刻の予約にのみ利用する。 */
export function useJstMidnightHomeRefresh(
	queryClient: QueryClient,
	enabled: boolean,
): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}
		return scheduleJstMidnightRefresh(() =>
			invalidateAndRefetchHome(queryClient).then(() => undefined),
		);
	}, [enabled, queryClient]);
}
