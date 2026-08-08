import { ApiError } from "~/lib/api/errors";
import type {
	ParsedCreateHabitRequest,
	UpdateHabitRequest,
} from "./habits.api-contract";

export type {
	CreateHabitRequest,
	UpdateHabitRequest,
} from "./habits.api-contract";

const graphemeSegmenter = new Intl.Segmenter("ja", {
	granularity: "grapheme",
});
// biome-ignore lint/complexity/useRegexLiterals: ES2022 targetでvフラグを使用するためコンストラクタ形式にする。
const emojiPattern = new RegExp("^\\p{RGI_Emoji}$", "v");
const createHabitFields = new Set(["name", "emoji"]);
const updateHabitFields = new Set(["name", "emoji"]);

function invalidRequest(cause?: unknown): never {
	throw new ApiError("INVALID_REQUEST", undefined, { cause });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countGraphemes(value: string): number {
	return [...graphemeSegmenter.segment(value)].length;
}

function isSingleEmojiGrapheme(value: string): boolean {
	return emojiPattern.test(value);
}

export function parseCreateHabitRequest(
	body: unknown,
): ParsedCreateHabitRequest {
	if (!isJsonObject(body)) {
		return invalidRequest();
	}
	if (Object.keys(body).some((field) => !createHabitFields.has(field))) {
		return invalidRequest();
	}
	if (typeof body.name !== "string") {
		return invalidRequest();
	}

	const name = body.name.trim();
	if (name === "" || countGraphemes(name) > 50) {
		return invalidRequest();
	}

	const emoji = body.emoji === undefined ? "" : body.emoji;
	if (
		typeof emoji !== "string" ||
		(emoji !== "" && !isSingleEmojiGrapheme(emoji))
	) {
		return invalidRequest();
	}

	return { name, emoji };
}

export function parseUpdateHabitRequest(body: unknown): UpdateHabitRequest {
	if (!isJsonObject(body)) {
		return invalidRequest();
	}

	const fields = Object.keys(body);
	if (
		fields.length === 0 ||
		fields.some((field) => !updateHabitFields.has(field))
	) {
		return invalidRequest();
	}

	const request: UpdateHabitRequest = {};
	if ("name" in body) {
		if (typeof body.name !== "string") {
			return invalidRequest();
		}
		const name = body.name.trim();
		if (name === "" || countGraphemes(name) > 50) {
			return invalidRequest();
		}
		request.name = name;
	}

	if ("emoji" in body) {
		if (
			typeof body.emoji !== "string" ||
			(body.emoji !== "" && !isSingleEmojiGrapheme(body.emoji))
		) {
			return invalidRequest();
		}
		request.emoji = body.emoji;
	}

	return request;
}
