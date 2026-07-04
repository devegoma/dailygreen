import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appApiRoutes = [
	{
		file: "src/routes/api/home.ts",
		path: 'createFileRoute("/api/home")',
		fullPath: "'/api/home'",
		parentRoute: "rootRouteImport",
		method: "GET",
	},
	{
		file: "src/routes/api/habits.ts",
		path: 'createFileRoute("/api/habits")',
		fullPath: "'/api/habits'",
		parentRoute: "rootRouteImport",
		method: "POST",
	},
	{
		file: "src/routes/api/habits/$habitId/archive.ts",
		path: 'createFileRoute("/api/habits/$habitId/archive")',
		fullPath: "'/api/habits/$habitId/archive'",
		parentRoute: "ApiHabitsRoute",
		method: "PATCH",
	},
	{
		file: "src/routes/api/habits/$habitId/complete.ts",
		path: 'createFileRoute("/api/habits/$habitId/complete")',
		fullPath: "'/api/habits/$habitId/complete'",
		parentRoute: "ApiHabitsRoute",
		method: "POST",
	},
];

describe("app API route smoke tests", () => {
	it("TanStack Start の file route path と HTTP method を宣言している", () => {
		for (const route of appApiRoutes) {
			const source = readFileSync(resolve(process.cwd(), route.file), "utf8");

			expect(source, `${route.file} が ${route.path} を宣言している`).toContain(
				route.path,
			);
			expect(
				source,
				`${route.file} が ${route.method} handler を宣言している`,
			).toContain(`${route.method}:`);
		}
	});

	it("生成済み route tree に app API routes を登録している", () => {
		const source = readFileSync(
			resolve(process.cwd(), "src/routeTree.gen.ts"),
			"utf8",
		);

		for (const route of appApiRoutes) {
			expect(
				source,
				`route tree が ${route.fullPath} を登録している`,
			).toContain(`${route.fullPath}:`);
			expect(
				source,
				`route tree が fullPath ${route.fullPath} を公開している`,
			).toContain(`fullPath: ${route.fullPath}`);
			expect(
				source,
				`route tree が ${route.fullPath} を ${route.parentRoute} に接続している`,
			).toContain(`parentRoute: typeof ${route.parentRoute}`);
		}
	});
});
