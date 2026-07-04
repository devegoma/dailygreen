import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { notImplementedApiError } from "~/lib/api/errors";

export type CreateHabitInput = {
	user: AuthenticatedUser;
	body: unknown;
	now?: Date;
};

export type HabitMutationInput = {
	user: AuthenticatedUser;
	habitId: string;
	now?: Date;
};

export async function createHabit(_input: CreateHabitInput): Promise<never> {
	throw notImplementedApiError("POST /api/habits");
}

export async function archiveHabit(_input: HabitMutationInput): Promise<never> {
	throw notImplementedApiError("PATCH /api/habits/:id/archive");
}

export async function completeHabit(
	_input: HabitMutationInput,
): Promise<never> {
	throw notImplementedApiError("POST /api/habits/:id/complete");
}
