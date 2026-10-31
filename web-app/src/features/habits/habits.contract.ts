import { ApiError } from "~/lib/api/errors";
import { validateHabitEmoji, validateHabitName } from "./habit-validation";
import type {
	ParsedCreateHabitRequest,
	UpdateHabitRequest,
} from "./habits.api-contract";

export type {
	CreateHabitRequest,
	UpdateHabitRequest,
} from "./habits.api-contract";

const createHabitFields = new Set(["name", "emoji"]);
const updateHabitFields = new Set(["name", "emoji"]);

function invalidRequest(cause?: unknown): never {
	throw new ApiError("INVALID_REQUEST", undefined, { cause });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

	const name = validateHabitName(body.name);
	if (!name.isValid) {
		return invalidRequest();
	}

	const emoji = body.emoji === undefined ? "" : body.emoji;
	if (typeof emoji !== "string" || !validateHabitEmoji(emoji).isValid) {
		return invalidRequest();
	}

	return { name: name.value, emoji };
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
		const name = validateHabitName(body.name);
		if (!name.isValid) {
			return invalidRequest();
		}
		request.name = name.value;
	}

	if ("emoji" in body) {
		if (
			typeof body.emoji !== "string" ||
			!validateHabitEmoji(body.emoji).isValid
		) {
			return invalidRequest();
		}
		request.emoji = body.emoji;
	}

	return request;
}
