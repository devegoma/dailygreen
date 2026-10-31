import { afterEach, describe, expect, it, vi } from "vitest";
import {
	archiveHabit,
	completeHabit,
	createHabit,
	updateHabit,
} from "./habits.api-client";

const fetchMock = vi.fn();

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("習慣API client", () => {
	it("create/update/archive/completeを仕様のmethod、path、bodyで送信する", async () => {
		vi.stubGlobal(
			"fetch",
			fetchMock
				.mockResolvedValueOnce(jsonResponse(habitResponse))
				.mockResolvedValueOnce(jsonResponse(habitResponse))
				.mockResolvedValueOnce(jsonResponse(habitResponse))
				.mockResolvedValueOnce(jsonResponse(completeResponse)),
		);

		await createHabit({ name: "読書", emoji: "📚" });
		await updateHabit("habit id", { name: "運動" });
		await archiveHabit("habit id");
		await completeHabit("habit id");

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"/api/habits",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ name: "読書", emoji: "📚" }),
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"/api/habits/habit%20id",
			expect.objectContaining({
				method: "PATCH",
				body: JSON.stringify({ name: "運動" }),
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			3,
			"/api/habits/habit%20id/archive",
			expect.objectContaining({ method: "PATCH", body: undefined }),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			4,
			"/api/habits/habit%20id/complete",
			expect.objectContaining({ method: "POST", body: undefined }),
		);
	});
});

const habitResponse = {
	id: "habit id",
	name: "読書",
	emoji: "📚",
	currentStreak: 1,
	maxStreak: 1,
	createdAt: "2026-08-08T00:00:00+09:00",
	archivedAt: null,
};
const completeResponse = {
	dailyRecord: {
		id: "record-id",
		habitId: "habit id",
		date: "2026-08-08",
		completedAt: "2026-08-08T00:00:00+09:00",
	},
	habit: { ...habitResponse, isCompletedToday: true },
};

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
	});
}
