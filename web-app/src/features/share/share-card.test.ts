import { describe, expect, it } from "vitest";
import type { HomeDataResponse } from "~/features/home/home.contract";
import {
	buildShareText,
	getShareActivityColor,
	getShareSummary,
} from "./share-card";

function makeHome(): HomeDataResponse {
	return {
		habits: [
			{
				id: "habit-1",
				name: "秘密の習慣A",
				emoji: "🌱",
				currentStreak: 4,
				maxStreak: 12,
				isCompletedToday: true,
			},
			{
				id: "habit-2",
				name: "秘密の習慣B",
				emoji: "",
				currentStreak: 9,
				maxStreak: 20,
				isCompletedToday: false,
			},
		],
		activityLog: [],
	};
}

describe("共有カード集計", () => {
	it("今日の達成数と継続中の最大ストリークを集計する", () => {
		expect(getShareSummary(makeHome())).toEqual({
			completedToday: 1,
			totalHabits: 2,
			longestCurrentStreak: 9,
		});
	});

	it("習慣がない場合は0として扱う", () => {
		expect(getShareSummary({ habits: [], activityLog: [] })).toEqual({
			completedToday: 0,
			totalHabits: 0,
			longestCurrentStreak: 0,
		});
	});

	it("共有文に習慣名を含めない", () => {
		const text = buildShareText(makeHome());
		expect(text).toContain("今日の習慣 1/2 達成");
		expect(text).toContain("継続中の最長ストリーク 9日");
		expect(text).not.toContain("秘密の習慣A");
		expect(text).not.toContain("秘密の習慣B");
	});
});

describe("共有カードのActivity Log色", () => {
	it.each([
		[null, "#f5f5f4"],
		[0, "#9ca3af"],
		[0.25, "#dcfce7"],
		[0.5, "#4ade80"],
		[0.75, "#15803d"],
		[1, "#052e16"],
	] as const)(
		"completionRate=%s を既存レベル相当の色へ変換する",
		(rate, color) => {
			expect(getShareActivityColor(rate)).toBe(color);
		},
	);

	it("範囲外の達成率を拒否する", () => {
		expect(() => getShareActivityColor(1.2)).toThrow("Invalid completion rate");
	});
});
