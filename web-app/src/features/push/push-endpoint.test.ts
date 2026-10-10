import { describe, expect, it } from "vitest";
import { pushEndpointRejectionReason } from "./push-endpoint";

describe("Push endpoint allowlist", () => {
	it.each([
		"https://fcm.googleapis.com/fcm/send/token",
		"https://updates.push.services.mozilla.com/wpush/v2/token",
		"https://web.push.apple.com/QABCDEFG",
		"https://example.push.apple.com/3/device/token",
		"https://wns2-sg2p.notify.windows.com/w/?token=abc",
	])("accepts supported browser push service: %s", (endpoint) => {
		expect(pushEndpointRejectionReason(endpoint)).toBeNull();
	});

	it.each([
		"http://fcm.googleapis.com/fcm/send/token",
		"https://127.0.0.1/a",
		"https://[::1]/a",
		"https://localhost/a",
		"https://fcm.googleapis.com:8443/a",
		"https://user:password@fcm.googleapis.com/a",
		"https://fcm.googleapis.com/a#hash",
		"https://fcm.googleapis.com./a",
		"https://FCM.GOOGLEAPIS.COM/a",
		"https://fcm.googleapis.com:443/a",
		"https://fcm.googleapis.com\\@127.0.0.1/a",
		"https://fcm.googleapis.com/a/../b",
		"https://fcm.googleapis.com.evil.example/a",
		"https://evilpush.apple.com/a",
		"https://push.apple.com/a",
		"https://notify.windows.com/a",
		"https://notify.windows.com.attacker.test/a",
		"https://example.com/a",
	])("rejects malformed or unapproved endpoints: %s", (endpoint) => {
		expect(pushEndpointRejectionReason(endpoint)).not.toBeNull();
	});
});
