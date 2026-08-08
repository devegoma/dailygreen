import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/db/index.server";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { completeHabit } from "./habits.service.server";

vi.mock("~/db/index.server", () => ({
	db: { transaction: vi.fn() },
}));

const transactionMock = vi.mocked(db.transaction);
const user = { id: "test-user" } as AuthenticatedUser;
const habitId = "00000000-0000-4000-8000-000000000000";

describe("completeHabitのDBエラー正規化", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("DrizzleQueryErrorのcauseにあるhabit_date_unique違反を409へ変換する", async () => {
		const postgresError = Object.assign(new Error("duplicate key"), {
			code: "23505",
			constraint_name: "habit_date_unique",
		});
		const drizzleError = Object.assign(new Error("Failed query"), {
			cause: postgresError,
		});
		transactionMock.mockRejectedValueOnce(drizzleError);

		await expect(
			completeHabit({
				user,
				habitId,
				now: new Date("2026-07-12T03:00:00.000Z"),
			}),
		).rejects.toMatchObject({
			code: "HABIT_ALREADY_COMPLETED_TODAY",
			status: 409,
		});
	});
});
