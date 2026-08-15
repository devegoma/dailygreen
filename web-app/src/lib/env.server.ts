import * as v from "valibot";

const nonEmpty = v.pipe(v.string(), v.trim(), v.minLength(1));

const serverEnvSchema = v.pipe(
	v.object({
		NODE_ENV: v.optional(
			v.picklist(["development", "test", "production"]),
			"development",
		),
		DATABASE_URL: v.pipe(
			v.string(),
			v.url(),
			v.check(
				(value) =>
					value.startsWith("postgres://") || value.startsWith("postgresql://"),
				"DATABASE_URL は PostgreSQL URL で指定してください。",
			),
		),
		BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(32)),
		BETTER_AUTH_URL: v.pipe(v.string(), v.url()),
		GOOGLE_CLIENT_ID: nonEmpty,
		GOOGLE_CLIENT_SECRET: nonEmpty,
		VAPID_PUBLIC_KEY: v.optional(nonEmpty),
		APP_VERSION: v.optional(nonEmpty, "development"),
	}),
	v.forward(
		v.partialCheck(
			[["NODE_ENV"], ["BETTER_AUTH_URL"]],
			(env) =>
				env.NODE_ENV !== "production" ||
				env.BETTER_AUTH_URL.startsWith("https://"),
			"production では HTTPS URL が必要です。",
		),
		["BETTER_AUTH_URL"],
	),
);

export type ServerEnv = v.InferOutput<typeof serverEnvSchema>;

export function parseServerEnv(source: NodeJS.ProcessEnv): ServerEnv {
	const viteSecretNames = Object.keys(source).filter(
		(name) =>
			name.startsWith("VITE_") &&
			/SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(name),
	);
	if (viteSecretNames.length > 0) {
		throw new Error(
			`秘密値に VITE_ prefix は使用できません: ${viteSecretNames.join(", ")}`,
		);
	}

	const result = v.safeParse(serverEnvSchema, source);
	if (!result.success) {
		const details = result.issues
			.map((issue) => `${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
			.join("; ");
		throw new Error(`環境変数が不正です: ${details}`);
	}
	return result.output;
}

export const env = parseServerEnv(process.env);
