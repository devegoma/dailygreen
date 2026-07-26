import { ApiError } from "~/lib/api/errors";

const graphemeSegmenter = new Intl.Segmenter("ja", {
	granularity: "grapheme",
});
const emojiPattern =
	/\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[#*0-9]\uFE0F?\u20E3/u;
const createHabitFields = new Set(["name", "emoji"]);

export type CreateHabitRequest = {
	name: string;
	emoji: string;
};

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
	return countGraphemes(value) === 1 && emojiPattern.test(value);
}

export function parseCreateHabitRequest(body: unknown): CreateHabitRequest {
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
