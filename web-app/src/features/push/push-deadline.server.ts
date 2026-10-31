/** Reject promptly while the same signal aborts the underlying I/O. */
export async function withPushDeadline<T>(
	signal: AbortSignal,
	work: () => Promise<T>,
): Promise<T> {
	signal.throwIfAborted();
	let onAbort: () => void = () => {};
	const aborted = new Promise<never>((_resolve, reject) => {
		onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
	});
	try {
		return await Promise.race([work(), aborted]);
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}
export function createPushDeadline(timeoutMs: number, parent?: AbortSignal) {
	const controller = new AbortController();
	const timer = setTimeout(
		() =>
			controller.abort(
				new DOMException("Push deadline exceeded", "TimeoutError"),
			),
		timeoutMs,
	);
	return {
		signal: parent
			? AbortSignal.any([parent, controller.signal])
			: controller.signal,
		dispose: () => clearTimeout(timer),
	};
}
