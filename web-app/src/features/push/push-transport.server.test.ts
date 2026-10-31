// @vitest-environment node
import { createECDH, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, request } from "node:http";
import type { RequestOptions as HttpsOptions } from "node:https";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webPush from "web-push";
import { createPushDeadline } from "./push-deadline.server";
import { sendPushNotification } from "./push-transport.server";

const network = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => network);

const keys = createECDH("prime256v1");
keys.generateKeys();
const subscription = {
	endpoint: "https://fcm.googleapis.com/fcm/send/secret-token",
	keys: {
		p256dh: keys.getPublicKey().toString("base64url"),
		auth: randomBytes(16).toString("base64url"),
	},
};
const options = {
	timeout: 10_000,
	TTL: 3600,
	vapidDetails: {
		...webPush.generateVAPIDKeys(),
		subject: "mailto:test@example.com",
	},
};
let server: ReturnType<typeof createServer>;

describe("sendPushNotification", () => {
	beforeEach(async () => {
		network.request.mockReset();
		server = createServer();
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		// Use Node's real HTTP request/socket lifecycle against a disposable
		// local server. Only the test adapter substitutes HTTPS and its address.
		network.request.mockImplementation(
			(
				_url: URL,
				init: HttpsOptions,
				callback: (res: IncomingMessage) => void,
			) =>
				request(
					`http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
					init,
					callback,
				),
		);
	});
	afterEach(async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		vi.restoreAllMocks();
	});

	it("暗号化とVAPID認証を維持して2xxを成功とする", async () => {
		server.on("request", (req, res) => {
			expect(req.headers["content-encoding"]).toBe("aes128gcm");
			expect(req.headers.authorization).toMatch(/^vapid /);
			res.writeHead(201).end();
		});
		await expect(
			sendPushNotification(
				subscription,
				"message",
				options,
				new AbortController().signal,
			),
		).resolves.toBeUndefined();
	});

	it.each([302, 404, 410, 500])(
		"HTTP %iを個別エラーにしリダイレクトを追跡しない",
		async (statusCode) => {
			server.on("request", (_req, res) =>
				res
					.writeHead(statusCode, { location: "https://127.0.0.1/private" })
					.end("sensitive response"),
			);
			await expect(
				sendPushNotification(
					subscription,
					"message",
					options,
					new AbortController().signal,
				),
			).rejects.toMatchObject({ statusCode });
			expect(network.request).toHaveBeenCalledTimes(1);
		},
	);

	it.each([false, true])(
		"応答が停滞・継続中でも総時間の期限でソケットを切断する (drip=%s)",
		async (drip) => {
			let closed = false;
			server.on("request", (_req, res) => {
				const timer = setInterval(() => {
					if (drip) res.write("x");
				}, 5);
				res.on("close", () => {
					closed = true;
					clearInterval(timer);
				});
			});
			const deadline = createPushDeadline(100);
			try {
				await expect(
					sendPushNotification(
						subscription,
						"message",
						options,
						deadline.signal,
					),
				).rejects.toMatchObject({ name: "AbortError" });
				await vi.waitFor(() => expect(closed).toBe(true));
			} finally {
				deadline.dispose();
			}
		},
	);

	it("保存済みの不正endpointへ接続しない", async () => {
		await expect(
			sendPushNotification(
				{ ...subscription, endpoint: "https://127.0.0.1/private" },
				"message",
				options,
				new AbortController().signal,
			),
		).rejects.toThrow("Push endpoint rejected");
		expect(network.request).not.toHaveBeenCalled();
	});
});
