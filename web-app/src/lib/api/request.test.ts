import { describe, expect, it } from "vitest";
import { parseJsonBody } from "./request";

describe("parseJsonBody", () => {
	it("空のリクエストボディをINVALID_REQUESTとして拒否する", async () => {
		await expect(
			parseJsonBody(
				new Request("http://localhost/api/habits/id", {
					method: "PATCH",
				}),
			),
		).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
	});

	it("JSONとして不正なリクエストボディをINVALID_REQUESTとして拒否する", async () => {
		await expect(
			parseJsonBody(
				new Request("http://localhost/api/habits/id", {
					method: "PATCH",
					body: "not-json",
				}),
			),
		).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
	});
});
