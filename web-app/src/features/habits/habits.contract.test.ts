import { describe, expect, it } from "vitest";
import { ApiError } from "~/lib/api/errors";
import {
	createHabitRequestSchema,
	habitIdSchema,
	parseApiInput,
	updateHabitRequestSchema,
} from "./habits.contract";

describe("habit request schemas", () => {
	it("習慣名をtrimし、複合絵文字を1グラフェムとして受け付ける", () => {
		expect(
			createHabitRequestSchema.parse({ name: "  読書  ", emoji: "👨‍👩‍👧‍👦" }),
		).toEqual({
			name: "読書",
			emoji: "👨‍👩‍👧‍👦",
		});
	});

	it("未知のフィールドと空の更新を拒否する", () => {
		expect(
			updateHabitRequestSchema.safeParse({ currentStreak: 10 }).success,
		).toBe(false);
		expect(updateHabitRequestSchema.safeParse({}).success).toBe(false);
	});

	it("不正なUUIDをINVALID_REQUESTへ変換する", () => {
		expect(() => parseApiInput(habitIdSchema, "not-a-uuid")).toThrow(ApiError);
	});
});
