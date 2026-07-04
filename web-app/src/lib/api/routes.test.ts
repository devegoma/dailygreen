import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

export function testAppApiRouteFilesDeclareExpectedPathsAndMethods() {
	for (const route of appApiRoutes) {
		const source = readFileSync(resolve(process.cwd(), route.file), "utf8");
		assert.ok(
			source.includes(route.path),
			`${route.file} declares ${route.path}`,
		);
		assert.ok(
			source.includes(`${route.method}:`),
			`${route.file} declares ${route.method} handler`,
		);
	}
}

export function testAppApiRoutesAreRegisteredInGeneratedRouteTree() {
	const source = readFileSync(
		resolve(process.cwd(), "src/routeTree.gen.ts"),
		"utf8",
	);

	for (const route of appApiRoutes) {
		assert.ok(
			source.includes(`${route.fullPath}:`),
			`route tree registers ${route.fullPath}`,
		);
		assert.ok(
			source.includes(`fullPath: ${route.fullPath}`),
			`route tree exposes fullPath ${route.fullPath}`,
		);
		assert.ok(
			source.includes(`parentRoute: typeof ${route.parentRoute}`),
			`route tree attaches ${route.fullPath} to ${route.parentRoute}`,
		);
	}
}
