import { describe, expect, it } from "vitest";
import {
	countGraphemes,
	isSingleEmojiGrapheme,
	validateHabitEmoji,
	validateHabitName,
} from "./habit-validation";

describe("habit-validation", () => {
	it("50グラフェムの習慣名を受け付け、51グラフェムを拒否する", () => {
		expect(validateHabitName("🌱".repeat(50))).toEqual({
			isValid: true,
			value: "🌱".repeat(50),
		});
		expect(validateHabitName("🌱".repeat(51))).toEqual({
			isValid: false,
			reason: "tooLong",
		});
	});

	it("空文字と空白のみの習慣名を拒否し、trim後の値を返す", () => {
		expect(validateHabitName("")).toEqual({
			isValid: false,
			reason: "required",
		});
		expect(validateHabitName("  \t ")).toEqual({
			isValid: false,
			reason: "required",
		});
		expect(validateHabitName("  読書  ")).toEqual({
			isValid: true,
			value: "読書",
		});
	});

	it.each(["📚", "👨‍👩‍👧‍👦", "👍🏽", "🇯🇵", "1️⃣", "❤️"])(
		"RGI Emoji %s をひとつのグラフェムとして受け付ける",
		(emoji) => {
			expect(countGraphemes(emoji)).toBe(1);
			expect(isSingleEmojiGrapheme(emoji)).toBe(true);
			expect(validateHabitEmoji(emoji)).toEqual({
				isValid: true,
				value: emoji,
			});
		},
	);

	it("空の絵文字を受け付け、複数または非絵文字を拒否する", () => {
		expect(validateHabitEmoji("")).toEqual({ isValid: true, value: "" });
		expect(validateHabitEmoji("📚📖")).toEqual({
			isValid: false,
			reason: "multiple",
		});
		expect(validateHabitEmoji("読")).toEqual({
			isValid: false,
			reason: "notEmoji",
		});
	});
});
