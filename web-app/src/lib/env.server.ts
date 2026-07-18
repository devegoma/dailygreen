import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

const serverEnvSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		DATABASE_URL: z
			.url()
			.refine(
				(value) =>
					value.startsWith("postgres://") || value.startsWith("postgresql://"),
				"DATABASE_URL は PostgreSQL URL で指定してください。",
			),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		GOOGLE_CLIENT_ID: nonEmpty,
		GOOGLE_CLIENT_SECRET: nonEmpty,
		APP_VERSION: nonEmpty.default("development"),
	})
	.superRefine((env, context) => {
		if (
			env.NODE_ENV === "production" &&
			!env.BETTER_AUTH_URL.startsWith("https://")
		) {
			context.addIssue({
				code: "custom",
				path: ["BETTER_AUTH_URL"],
				message: "production では HTTPS URL が必要です。",
			});
		}
	});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

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

	const result = serverEnvSchema.safeParse(source);
	if (!result.success) {
		const details = result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join("; ");
		throw new Error(`環境変数が不正です: ${details}`);
	}
	return result.data;
}

export const env = parseServerEnv(process.env);
