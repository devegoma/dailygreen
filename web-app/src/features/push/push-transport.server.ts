import { request } from "node:https";
import type { PushSubscription, RequestOptions } from "web-push";
import webPush from "web-push";
import { pushEndpointRejectionReason } from "./push-endpoint";

/** Keep encryption/VAPID in web-push; own the cancellable HTTPS request. */
export async function sendPushNotification(
	subscription: PushSubscription,
	payload: string,
	options: RequestOptions,
	signal: AbortSignal,
): Promise<void> {
	signal.throwIfAborted();
	if (pushEndpointRejectionReason(subscription.endpoint)) {
		throw new Error("Push endpoint rejected");
	}
	const details = webPush.generateRequestDetails(
		subscription,
		payload,
		options,
	);
	await new Promise<void>((resolve, reject) => {
		const outgoing = request(
			new URL(details.endpoint),
			{
				method: details.method,
				headers: details.headers,
				timeout: options.timeout,
				signal,
				// No shared pooled sockets, redirects, or implicit proxy routing.
				agent: false,
			},
			(response) => {
				const statusCode = response.statusCode ?? 0;
				response.on("error", reject);
				response.on("end", () => {
					if (statusCode >= 200 && statusCode < 300) resolve();
					else {
						reject(
							Object.assign(new Error("Push service rejected request"), {
								statusCode,
							}),
						);
					}
				});
				// Drain without accumulating possibly sensitive/unbounded bodies.
				response.resume();
			},
		);
		outgoing.on("error", reject);
		outgoing.on("timeout", () => {
			outgoing.destroy(new Error("Push socket timeout"));
		});
		outgoing.end(details.body);
	});
}
