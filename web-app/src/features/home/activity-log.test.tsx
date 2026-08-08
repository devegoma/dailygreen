import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	ActivityLog,
	buildActivityLogWeeks,
	getActivityLogAriaLabel,
	getActivityLogLevel,
	parseDateOnly,
} from "./activity-log";
import type { ActivityLogEntry } from "./home.contract";

afterEach(() => {
	cleanup();
});

describe("ActivityLog", () => {
	it("365件の実データを日曜始まりの週グリッドへ、paddingを除いて表示する", () => {
		const entries = makeEntries("2026-01-04", 365);
		const weeks = buildActivityLogWeeks(entries);

		expect(weeks).toHaveLength(53);
		expect(weeks[0]?.cells.filter(isDataCell)).toHaveLength(7);
		expect(weeks.at(-1)?.cells.filter(isDataCell)).toHaveLength(1);
		expect(weeks.at(-1)?.cells.filter(isPlaceholderCell)).toHaveLength(6);

		render(<ActivityLog entries={entries} />);
		const grid = screen.getByRole("grid", { name: "直近365日の達成率" });
		const rows = within(grid).getAllByRole("row");
		expect(within(grid).getAllByRole("gridcell")).toHaveLength(365);
		expect(rows).toHaveLength(7);
		expect(Array.from(grid.children)).toEqual(rows);
		for (const [index, row] of rows.entries()) {
			expect(row).toHaveAttribute("aria-rowindex", String(index + 1));
		}
		const placeholders = document.querySelectorAll(
			"[data-activity-placeholder]",
		);
		expect(placeholders).toHaveLength(6);
		for (const placeholder of placeholders) {
			expect(placeholder).toHaveAttribute("aria-hidden", "true");
			expect(placeholder).toHaveAttribute("role", "presentation");
			expect(placeholder).not.toHaveAttribute("aria-label");
			expect(placeholder).not.toHaveAttribute("title");
		}
		expect(grid).toHaveAttribute("aria-rowcount", "7");
		expect(grid).toHaveAttribute("aria-colcount", "53");
	});

	it("先頭日が日曜以外でもUTC基準の曜日に合わせてleading paddingを置く", () => {
		const entries = makeEntries("2024-06-01", 365);
		const weeks = buildActivityLogWeeks(entries);

		expect(parseDateOnly("2024-06-01").weekday).toBe(6);
		expect(weeks[0]?.cells.slice(0, 6).every(isPlaceholderCell)).toBe(true);
		expect(weeks[0]?.cells[6]).toMatchObject({
			kind: "data",
			entry: { date: "2024-06-01" },
		});

		render(<ActivityLog entries={entries} />);
		const firstDataCell = screen.getByRole("gridcell", {
			name: "2024-06-01: 未確定または対象なし",
		});
		expect(firstDataCell).toHaveAttribute("aria-rowindex", "7");
		expect(firstDataCell).toHaveAttribute("aria-colindex", "1");
		const firstRow = within(
			screen.getByRole("grid", { name: "直近365日の達成率" }),
		).getAllByRole("row")[0];
		expect(firstRow).toContainElement(
			document.querySelector('[data-activity-placeholder="true"]'),
		);
	});

	it("null・zero・4段階の達成率境界を区別する", () => {
		expect(getActivityLogLevel(null)).toBe("null");
		expect(getActivityLogLevel(0)).toBe("zero");
		expect(getActivityLogLevel(0.01)).toBe("level-1");
		expect(getActivityLogLevel(0.25)).toBe("level-1");
		expect(getActivityLogLevel(0.26)).toBe("level-2");
		expect(getActivityLogLevel(0.5)).toBe("level-2");
		expect(getActivityLogLevel(0.51)).toBe("level-3");
		expect(getActivityLogLevel(0.99)).toBe("level-3");
		expect(getActivityLogLevel(1)).toBe("level-4");
	});

	it("日本語のaria-labelとtooltipを実データにだけ付ける", () => {
		const entries = makeEntries("2026-01-04", 365);
		entries[0] = { date: "2026-01-04", completionRate: 0.8 };
		entries[1] = { date: "2026-01-05", completionRate: null };
		render(<ActivityLog entries={entries} />);

		const normal = screen.getByRole("gridcell", {
			name: "2026-01-04: 達成率 80%",
		});
		expect(normal).toHaveAttribute("title", "2026-01-04: 達成率 80%");
		expect(
			screen.getByRole("gridcell", {
				name: "2026-01-05: 未確定または対象なし",
			}),
		).toBeInTheDocument();
		expect(
			getActivityLogAriaLabel({ date: "2026-01-06", completionRate: 0 }),
		).toBe("2026-01-06: 達成率 0%");
	});

	it("月・曜日ラベルと日本語凡例を表示する", () => {
		render(<ActivityLog entries={makeEntries("2026-01-04", 365)} />);

		expect(screen.getByText("少ない")).toBeInTheDocument();
		expect(screen.getByText("多い")).toBeInTheDocument();
		expect(screen.getByText("月")).toBeInTheDocument();
		expect(screen.getByText("水")).toBeInTheDocument();
		expect(screen.getByText("金")).toBeInTheDocument();
		expect(
			screen.getAllByTestId("activity-log-month-label")[0],
		).toHaveTextContent("1月");
		expect(screen.getByText("2月")).toBeInTheDocument();
		expect(screen.getByTestId("activity-log-weekday-labels")).toHaveClass(
			"mt-[13px]",
			"h-[5.5rem]",
			"grid-rows-[repeat(7,0.625rem)]",
			"gap-[3px]",
		);
		expect(screen.getByTestId("activity-log-grid")).toHaveClass(
			"grid-rows-[repeat(7,0.625rem)]",
			"gap-[3px]",
		);
	});

	it("null・zero・4段階のセルを意味別のpalette hookで描画する", () => {
		const paletteEntries = makeEntries("2026-01-04", 365).map(
			(entry, index) => ({
				...entry,
				completionRate: [null, 0, 0.25, 0.5, 0.75, 1][index % 6] ?? null,
			}),
		);
		render(<ActivityLog entries={paletteEntries} />);

		for (const level of [
			"null",
			"zero",
			"level-1",
			"level-2",
			"level-3",
			"level-4",
		]) {
			const cell = document.querySelector(
				`[role="gridcell"][data-activity-level="${level}"]`,
			);
			expect(cell).toHaveClass("outline", "outline-1");
		}
	});

	it("cellをTab stopやクリック可能な要素にしない", () => {
		render(<ActivityLog entries={makeEntries("2026-01-04", 365)} />);

		for (const cell of screen.getAllByRole("gridcell")) {
			expect(cell.tagName).toBe("DIV");
			expect(cell).not.toHaveAttribute("tabindex");
			expect(cell).not.toHaveAttribute("role", "button");
		}
	});

	it("mobileでは初回だけ右端へ寄せ、rerender後のユーザーscrollを維持する", () => {
		stubMatchMedia(true);
		const restoreScrollWidth = stubScrollWidth(720);
		const entries = makeEntries("2026-01-04", 365);
		const { rerender } = render(<ActivityLog entries={[]} />);
		const scrollArea = screen.getByTestId("activity-log-scroll-area");

		expect(scrollArea.scrollLeft).toBe(0);
		rerender(<ActivityLog entries={entries} />);
		expect(scrollArea.scrollLeft).toBe(720);
		scrollArea.scrollLeft = 123;
		rerender(
			<ActivityLog
				entries={[
					...entries.slice(0, -1),
					{ date: "2027-01-03", completionRate: 1 },
				]}
			/>,
		);
		expect(scrollArea.scrollLeft).toBe(123);
		restoreScrollWidth();
	});

	it("desktopでは初期scroll位置を強制しない", () => {
		stubMatchMedia(false);
		const restoreScrollWidth = stubScrollWidth(720);
		render(<ActivityLog entries={makeEntries("2026-01-04", 365)} />);

		expect(screen.getByTestId("activity-log-scroll-area").scrollLeft).toBe(0);
		restoreScrollWidth();
	});
});

function makeEntries(startDate: string, count: number): ActivityLogEntry[] {
	const start = parseDateOnly(startDate);
	return Array.from({ length: count }, (_, index) => {
		const date = new Date(
			Date.UTC(start.year, start.month - 1, start.day + index),
		);
		return {
			date: date.toISOString().slice(0, 10),
			completionRate: index % 5 === 0 ? null : (index % 4) / 4,
		};
	});
}

function isDataCell(
	cell: ReturnType<typeof buildActivityLogWeeks>[number]["cells"][number],
): boolean {
	return cell.kind === "data";
}

function isPlaceholderCell(
	cell: ReturnType<typeof buildActivityLogWeeks>[number]["cells"][number],
): boolean {
	return cell.kind === "placeholder";
}

function stubMatchMedia(matches: boolean): void {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: () => ({
			matches,
			media: "",
			onchange: null,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			dispatchEvent: () => false,
		}),
	});
}

function stubScrollWidth(value: number): () => void {
	const descriptor = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"scrollWidth",
	);
	Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
		configurable: true,
		get: () => value,
	});
	return () => {
		if (descriptor) {
			Object.defineProperty(HTMLElement.prototype, "scrollWidth", descriptor);
		}
	};
}
