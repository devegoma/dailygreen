/**
 * Server-side Web Push destination policy. Browser-supplied endpoint strings are
 * untrusted, including records already stored before this policy was added.
 */
const EXACT_PUSH_HOSTS = new Set([
	"fcm.googleapis.com",
	"updates.push.services.mozilla.com",
]);

// Require a real subdomain label, never a suffix-only comparison.
const PUSH_HOST_SUFFIXES = ["push.apple.com", "notify.windows.com"];

export type PushEndpointRejection = "invalid_url" | "unsupported_host";

export function pushEndpointRejectionReason(
	endpoint: unknown,
): PushEndpointRejection | null {
	if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 4096) {
		return "invalid_url";
	}

	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return "invalid_url";
	}

	// web-push 3.6.x uses legacy url.parse() when sending. Only accept URLs
	// already in canonical WHATWG form to avoid parser disagreement.
	if (
		url.href !== endpoint ||
		url.protocol !== "https:" ||
		url.username !== "" ||
		url.password !== "" ||
		url.port !== "" ||
		url.hash !== "" ||
		url.hostname.endsWith(".")
	) {
		return "invalid_url";
	}

	const hostname = url.hostname;
	const approved =
		EXACT_PUSH_HOSTS.has(hostname) ||
		PUSH_HOST_SUFFIXES.some((suffix) => hostname.endsWith(`.${suffix}`));

	return approved ? null : "unsupported_host";
}
