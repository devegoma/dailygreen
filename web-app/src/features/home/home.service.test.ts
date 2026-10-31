import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/db/index.server";
import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { getHomeData } from "./home.service.server";

vi.mock("~/db/index.server", () => ({
	db: { transaction: vi.fn() },
}));

const transactionMock = vi.mocked(db.transaction);
const user = { id: "test-user" } as AuthenticatedUser;

describe("getHomeData", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("transaction失敗時に補正前データへフォールバックしない", async () => {
		transactionMock.mockRejectedValueOnce(new Error("database unavailable"));

		await expect(
			getHomeData({
				user,
				now: new Date("2026-07-12T03:00:00.000Z"),
			}),
		).rejects.toThrow("database unavailable");
	});

	it("habit件数に依存せず固定回数の一括SELECTで取得する", async () => {
		const activeHabits = Array.from({ length: 10 }, (_, index) => ({
			id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
			userId: user.id,
			name: `habit-${index}`,
			emoji: "",
			currentStreak: 0,
			maxStreak: 0,
			archivedAt: null,
			createdAt: new Date("2026-07-01T03:00:00.000Z"),
			updatedAt: new Date("2026-07-01T03:00:00.000Z"),
		}));
		const lockHabits = vi.fn().mockResolvedValue(activeHabits);
		const selectLockedHabits = vi.fn().mockResolvedValue(activeHabits);
		const groupLatestRecords = vi.fn().mockResolvedValue([]);
		const selectActivityRecords = vi.fn().mockResolvedValue([]);
		const select = vi
			.fn()
			.mockReturnValueOnce({
				from: () => ({
					where: () => ({
						orderBy: () => ({ for: lockHabits }),
					}),
				}),
			})
			.mockReturnValueOnce({
				from: () => ({
					where: () => ({ orderBy: selectLockedHabits }),
				}),
			})
			.mockReturnValueOnce({
				from: () => ({
					where: () => ({ groupBy: groupLatestRecords }),
				}),
			})
			.mockReturnValueOnce({
				from: () => ({ where: selectActivityRecords }),
			});
		const fakeTx = { select };
		transactionMock.mockImplementationOnce(async (callback) =>
			callback(fakeTx as never),
		);

		const result = await getHomeData({
			user,
			now: new Date("2026-07-12T03:00:00.000Z"),
		});

		expect(result.habits).toHaveLength(10);
		expect(select).toHaveBeenCalledTimes(4);
		expect(lockHabits).toHaveBeenCalledTimes(1);
		expect(selectLockedHabits).toHaveBeenCalledTimes(1);
		expect(groupLatestRecords).toHaveBeenCalledTimes(1);
		expect(selectActivityRecords).toHaveBeenCalledTimes(1);
	});
});
