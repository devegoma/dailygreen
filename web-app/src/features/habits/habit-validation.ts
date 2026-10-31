export const HABIT_NAME_MAX_GRAPHEMES = 50;

const graphemeSegmenter = new Intl.Segmenter("ja", {
	granularity: "grapheme",
});
// biome-ignore lint/complexity/useRegexLiterals: ES2022 targetでvフラグを使用するためコンストラクタ形式にする。
const emojiPattern = new RegExp("^\\p{RGI_Emoji}$", "v");

export function countGraphemes(value: string): number {
	return [...graphemeSegmenter.segment(value)].length;
}

export function isSingleEmojiGrapheme(value: string): boolean {
	return emojiPattern.test(value);
}

export type HabitNameValidation =
	| { isValid: true; value: string }
	| { isValid: false; reason: "required" | "tooLong" };

/** server と form の両方で使う、trim 後の習慣名の検証。 */
export function validateHabitName(value: string): HabitNameValidation {
	const trimmedValue = value.trim();
	if (trimmedValue === "") {
		return { isValid: false, reason: "required" };
	}
	if (countGraphemes(trimmedValue) > HABIT_NAME_MAX_GRAPHEMES) {
		return { isValid: false, reason: "tooLong" };
	}
	return { isValid: true, value: trimmedValue };
}

export type HabitEmojiValidation =
	| { isValid: true; value: string }
	| { isValid: false; reason: "multiple" | "notEmoji" };

/** 空文字または RGI Emoji ひとつを受け付ける。emoji は trim しない。 */
export function validateHabitEmoji(value: string): HabitEmojiValidation {
	if (value === "") {
		return { isValid: true, value };
	}
	if (countGraphemes(value) > 1) {
		return { isValid: false, reason: "multiple" };
	}
	if (!isSingleEmojiGrapheme(value)) {
		return { isValid: false, reason: "notEmoji" };
	}
	return { isValid: true, value };
}
