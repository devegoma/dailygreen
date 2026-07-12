import { z } from "zod";
import { ApiError } from "~/lib/api/errors";

const graphemeSegmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
const emojiPattern = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;

function isSingleEmojiGrapheme(value: string): boolean {
	const graphemes = [...graphemeSegmenter.segment(value)];
	return graphemes.length === 1 && emojiPattern.test(value);
}

const habitNameSchema = z.string().trim().min(1).max(50);
const habitEmojiSchema = z
	.string()
	.refine((value) => value === "" || isSingleEmojiGrapheme(value), {
		message: "emoji は空文字または1つの絵文字で指定してください。",
	});

export const habitIdSchema = z.uuid();

export const createHabitRequestSchema = z
	.object({
		name: habitNameSchema,
		emoji: habitEmojiSchema.optional().default(""),
	})
	.strict();

export const updateHabitRequestSchema = z
	.object({
		name: habitNameSchema.optional(),
		emoji: habitEmojiSchema.optional(),
	})
	.strict()
	.refine((value) => value.name !== undefined || value.emoji !== undefined, {
		message: "name または emoji のいずれかを指定してください。",
	});

export type CreateHabitRequest = z.infer<typeof createHabitRequestSchema>;
export type UpdateHabitRequest = z.infer<typeof updateHabitRequestSchema>;

export function parseApiInput<T>(schema: z.ZodType<T>, value: unknown): T {
	const result = schema.safeParse(value);
	if (!result.success) {
		throw new ApiError("INVALID_REQUEST", "リクエスト内容が不正です。", {
			cause: result.error,
		});
	}
	return result.data;
}
