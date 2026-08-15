const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;

function requiredEnv(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`${name} is required`);
	}
	return value;
}

function parsePositiveInteger(name, fallback) {
	const raw = process.env[name]?.trim();
	if (!raw) {
		return fallback;
	}
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

function log(level, event, fields = {}) {
	console.log(
		JSON.stringify({
			timestamp: new Date().toISOString(),
			level,
			event,
			...fields,
		}),
	);
}

const jobUrl = new URL(requiredEnv("INTERNAL_JOB_URL"));
if (!/^https?:$/.test(jobUrl.protocol)) {
	throw new Error("INTERNAL_JOB_URL must use http or https");
}

const jobToken = requiredEnv("INTERNAL_JOB_TOKEN");
const intervalMs = parsePositiveInteger(
	"SCHEDULER_INTERVAL_MS",
	DEFAULT_INTERVAL_MS,
);
const timeoutMs = parsePositiveInteger("SCHEDULER_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

let stopping = false;
let timer;

async function dispatch() {
	const startedAt = Date.now();
	try {
		const response = await fetch(jobUrl, {
			method: "POST",
			headers: {
				accept: "application/json",
				"x-internal-job-token": jobToken,
			},
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!response.ok) {
			const body = (await response.text()).slice(0, 512);
			log("error", "push_scheduler_dispatch_failed", {
				status: response.status,
				durationMs: Date.now() - startedAt,
				responseBody: body,
			});
			return;
		}

		log("info", "push_scheduler_dispatch_succeeded", {
			status: response.status,
			durationMs: Date.now() - startedAt,
		});
	} catch (error) {
		log("error", "push_scheduler_dispatch_error", {
			durationMs: Date.now() - startedAt,
			errorName: error instanceof Error ? error.name : "UnknownError",
		});
	}
}

function scheduleNext() {
	if (stopping) {
		return;
	}
	timer = setTimeout(async () => {
		await dispatch();
		scheduleNext();
	}, intervalMs);
}

function shutdown(signal) {
	if (stopping) {
		return;
	}
	stopping = true;
	if (timer) {
		clearTimeout(timer);
	}
	log("info", "push_scheduler_stopped", { signal });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

log("info", "push_scheduler_started", {
	jobOrigin: jobUrl.origin,
	jobPath: jobUrl.pathname,
	intervalMs,
	timeoutMs,
});

await dispatch();
scheduleNext();
