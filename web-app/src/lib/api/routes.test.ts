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
	it("declares the expected TanStack Start file route paths and methods", () => {
		for (const route of appApiRoutes) {
			const source = readFileSync(resolve(process.cwd(), route.file), "utf8");

			expect(source, `${route.file} declares ${route.path}`).toContain(
				route.path,
			);
			expect(
				source,
				`${route.file} declares ${route.method} handler`,
			).toContain(`${route.method}:`);
		}
	});

	it("registers app API routes in the generated route tree", () => {
		const source = readFileSync(
			resolve(process.cwd(), "src/routeTree.gen.ts"),
			"utf8",
		);

		for (const route of appApiRoutes) {
			expect(source, `route tree registers ${route.fullPath}`).toContain(
				`${route.fullPath}:`,
			);
			expect(source, `route tree exposes fullPath ${route.fullPath}`).toContain(
				`fullPath: ${route.fullPath}`,
			);
			expect(
				source,
				`route tree attaches ${route.fullPath} to ${route.parentRoute}`,
			).toContain(`parentRoute: typeof ${route.parentRoute}`);
		}
	});
});
