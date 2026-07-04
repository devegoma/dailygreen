import { describe, expect, it } from "vitest";
import {
	addDaysToJstDateString,
	getJstDateContext,
	toJstDateString,
	toJstDateTimeString,
} from "./date";

describe("JST date utilities", () => {
	it("UTC の日付境界をまたいでも JST の日付文字列を返す", () => {
		expect(toJstDateString(new Date("2024-11-19T15:00:00.000Z"))).toBe(
			"2024-11-20",
		);
	});

	it("固定オフセット付きの JST 日時文字列を返す", () => {
		expect(toJstDateTimeString(new Date("2024-11-19T15:00:00.000Z"))).toBe(
			"2024-11-20T00:00:00+09:00",
		);
	});

	it("JST の today / yesterday コンテキストを返す", () => {
		expect(getJstDateContext(new Date("2024-01-01T00:00:00.000Z"))).toEqual({
			today: "2024-01-01",
			yesterday: "2023-12-31",
		});
	});

	it("JST 日付文字列に日数を加算できる", () => {
		expect(addDaysToJstDateString("2024-02-28", 1)).toBe("2024-02-29");
		expect(addDaysToJstDateString("2024-03-01", -1)).toBe("2024-02-29");
	});
});
