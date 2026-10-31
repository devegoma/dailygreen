import { describe, expect, it } from "vitest";
import { ApiError } from "~/lib/api/errors";
import {
	parseCreateHabitRequest,
	parseUpdateHabitRequest,
} from "./habits.contract";

describe("parseCreateHabitRequest", () => {
	it("習慣名をtrimし、絵文字の未指定を空文字へ正規化する", () => {
		expect(parseCreateHabitRequest({ name: "  読書  " })).toEqual({
			name: "読書",
			emoji: "",
		});
	});

	it.each(["📚", "👨‍👩‍👧‍👦", "👍🏽", "🇯🇵", "1️⃣", "❤️"])(
		"単一の絵文字グラフェムクラスタ %s を受け付ける",
		(emoji) => {
			expect(parseCreateHabitRequest({ name: "習慣", emoji })).toEqual({
				name: "習慣",
				emoji,
			});
		},
	);

	it.each([
		undefined,
		null,
		[],
		{},
		{ name: "" },
		{ name: "   " },
		{ name: "あ".repeat(51) },
		{ name: 123 },
		{ name: "習慣", unknown: true },
	])("不正なリクエスト %j を拒否する", (body) => {
		expect(() => parseCreateHabitRequest(body)).toThrow(ApiError);
		try {
			parseCreateHabitRequest(body);
		} catch (error) {
			expect(error).toMatchObject({ code: "INVALID_REQUEST", status: 400 });
		}
	});

	it.each([
		null,
		"emoji",
		"📚📖",
		" ",
		"❤",
		"\u20E3",
		"📚\uFE0E",
		"📚\u200D",
		1,
	])("不正なemoji %j を拒否する", (emoji) => {
		expect(() => parseCreateHabitRequest({ name: "習慣", emoji })).toThrowError(
			expect.objectContaining({
				code: "INVALID_REQUEST",
				status: 400,
			}),
		);
	});

	it("50グラフェムの習慣名を受け付ける", () => {
		const name = "🌱".repeat(50);
		expect(parseCreateHabitRequest({ name })).toEqual({ name, emoji: "" });
	});

	it("51グラフェムの習慣名を拒否する", () => {
		expect(() =>
			parseCreateHabitRequest({ name: "🌱".repeat(51) }),
		).toThrowError(
			expect.objectContaining({ code: "INVALID_REQUEST", status: 400 }),
		);
	});
});

describe("parseUpdateHabitRequest", () => {
	it("nameだけをtrimして受け付ける", () => {
		expect(parseUpdateHabitRequest({ name: "  毎日読書する  " })).toEqual({
			name: "毎日読書する",
		});
	});

	it("emojiだけ、またはnameとemojiの両方を受け付ける", () => {
		expect(parseUpdateHabitRequest({ emoji: "📖" })).toEqual({
			emoji: "📖",
		});
		expect(parseUpdateHabitRequest({ name: "運動", emoji: "🏃🏻‍♀️" })).toEqual({
			name: "運動",
			emoji: "🏃🏻‍♀️",
		});
	});

	it("空文字のemojiを受け付ける", () => {
		expect(parseUpdateHabitRequest({ emoji: "" })).toEqual({ emoji: "" });
	});

	it.each(["📚", "👨‍👩‍👧‍👦", "👍🏽", "🇯🇵", "1️⃣", "❤️"])(
		"単一の絵文字グラフェムクラスタ %s を受け付ける",
		(emoji) => {
			expect(parseUpdateHabitRequest({ emoji })).toEqual({ emoji });
		},
	);

	it.each([
		undefined,
		null,
		[],
		"name",
		{},
		{ unknown: true },
		{ name: "習慣", currentStreak: 10 },
		{ name: "" },
		{ name: "   " },
		{ name: "あ".repeat(51) },
		{ name: null },
		{ name: 123 },
	])("不正なリクエスト %j を拒否する", (body) => {
		expect(() => parseUpdateHabitRequest(body)).toThrowError(
			expect.objectContaining({ code: "INVALID_REQUEST", status: 400 }),
		);
	});

	it.each([
		null,
		"emoji",
		"📚📖",
		" ",
		"❤",
		"\u20E3",
		"📚\uFE0E",
		"📚\u200D",
		1,
	])("不正なemoji %j を拒否する", (emoji) => {
		expect(() => parseUpdateHabitRequest({ emoji })).toThrowError(
			expect.objectContaining({ code: "INVALID_REQUEST", status: 400 }),
		);
	});

	it("50グラフェムの習慣名を受け付ける", () => {
		const name = "🌱".repeat(50);
		expect(parseUpdateHabitRequest({ name })).toEqual({ name });
	});

	it("51グラフェムの習慣名を拒否する", () => {
		expect(() =>
			parseUpdateHabitRequest({ name: "🌱".repeat(51) }),
		).toThrowError(
			expect.objectContaining({ code: "INVALID_REQUEST", status: 400 }),
		);
	});
});
