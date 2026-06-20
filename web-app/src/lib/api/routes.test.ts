import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appApiRoutes = [
	{
		file: "src/routes/api/home.ts",
		path: 'createFileRoute("/api/home")',
		method: "GET",
	},
	{
		file: "src/routes/api/habits.ts",
		path: 'createFileRoute("/api/habits")',
		method: "POST",
	},
	{
		file: "src/routes/api/habits/$habitId/archive.ts",
		path: 'createFileRoute("/api/habits/$habitId/archive")',
		method: "PATCH",
	},
	{
		file: "src/routes/api/habits/$habitId/complete.ts",
		path: 'createFileRoute("/api/habits/$habitId/complete")',
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
