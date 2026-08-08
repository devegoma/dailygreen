import { requestJson } from "~/lib/api/client";
import type {
	CompleteHabitResponse,
	CreateHabitRequest,
	HabitResponse,
	UpdateHabitRequest,
} from "./habits.api-contract";

function jsonRequest(method: "POST" | "PATCH", body?: unknown): RequestInit {
	return {
		method,
		headers:
			body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	};
}

export function createHabit(
	request: CreateHabitRequest,
): Promise<HabitResponse> {
	return requestJson<HabitResponse>(
		"/api/habits",
		jsonRequest("POST", request),
	);
}

export function updateHabit(
	habitId: string,
	request: UpdateHabitRequest,
): Promise<HabitResponse> {
	return requestJson<HabitResponse>(
		`/api/habits/${encodeURIComponent(habitId)}`,
		jsonRequest("PATCH", request),
	);
}

export function archiveHabit(habitId: string): Promise<HabitResponse> {
	return requestJson<HabitResponse>(
		`/api/habits/${encodeURIComponent(habitId)}/archive`,
		jsonRequest("PATCH"),
	);
}

export function completeHabit(habitId: string): Promise<CompleteHabitResponse> {
	return requestJson<CompleteHabitResponse>(
		`/api/habits/${encodeURIComponent(habitId)}/complete`,
		jsonRequest("POST"),
	);
}
