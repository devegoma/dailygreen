import { describe, expect, it } from "vitest";
import {
	addDaysToJstDateString,
	getJstDateContext,
	toJstDateString,
	toJstDateTimeString,
} from "./date";

describe("JST date utilities", () => {
	it("formats a JST date across a UTC day boundary", () => {
		expect(toJstDateString(new Date("2024-11-19T15:00:00.000Z"))).toBe(
			"2024-11-20",
		);
	});

	it("formats a JST datetime with a fixed offset", () => {
		expect(toJstDateTimeString(new Date("2024-11-19T15:00:00.000Z"))).toBe(
			"2024-11-20T00:00:00+09:00",
		);
	});

	it("builds a JST date context", () => {
		expect(getJstDateContext(new Date("2024-01-01T00:00:00.000Z"))).toEqual({
			today: "2024-01-01",
			yesterday: "2023-12-31",
		});
	});

	it("adds days to a JST date string", () => {
		expect(addDaysToJstDateString("2024-02-28", 1)).toBe("2024-02-29");
		expect(addDaysToJstDateString("2024-03-01", -1)).toBe("2024-02-29");
	});
});
