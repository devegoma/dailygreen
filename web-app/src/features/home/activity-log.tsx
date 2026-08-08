import { useEffect, useRef } from "react";
import type { ActivityLogEntry } from "./home.contract";

const DAYS_PER_WEEK = 7;
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";
const WEEKDAY_ROW_IDS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
] as const;

export type ActivityLogLevel =
	| "null"
	| "zero"
	| "level-1"
	| "level-2"
	| "level-3"
	| "level-4";

type DateOnly = {
	year: number;
	month: number;
	day: number;
	weekday: number;
};

type ActivityLogDataCell = {
	kind: "data";
	entry: ActivityLogEntry;
	date: DateOnly;
	level: ActivityLogLevel;
};

type ActivityLogPlaceholderCell = {
	kind: "placeholder";
	id: string;
};

type ActivityLogCell = ActivityLogDataCell | ActivityLogPlaceholderCell;

export type ActivityLogWeek = {
	id: string;
	cells: ActivityLogCell[];
	monthLabels: string[];
};

/** RFC 3339 full-date をローカルタイムゾーンに依存せず曜日へ変換する。 */
export function parseDateOnly(date: string): DateOnly {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) {
		throw new Error(`Invalid full-date: ${date}`);
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	if (
		utcDate.getUTCFullYear() !== year ||
		utcDate.getUTCMonth() !== month - 1 ||
		utcDate.getUTCDate() !== day
	) {
		throw new Error(`Invalid full-date: ${date}`);
	}

	return { year, month, day, weekday: utcDate.getUTCDay() };
}

export function getActivityLogLevel(
	completionRate: number | null,
): ActivityLogLevel {
	if (completionRate === null) {
		return "null";
	}
	if (completionRate === 0) {
		return "zero";
	}
	if (completionRate > 0 && completionRate <= 0.25) {
		return "level-1";
	}
	if (completionRate > 0.25 && completionRate <= 0.5) {
		return "level-2";
	}
	if (completionRate > 0.5 && completionRate < 1) {
		return "level-3";
	}
	if (completionRate === 1) {
		return "level-4";
	}

	throw new Error(`Invalid completion rate: ${completionRate}`);
}

export function getActivityLogAriaLabel(entry: ActivityLogEntry): string {
	if (entry.completionRate === null) {
		return `${entry.date}: 未確定または対象なし`;
	}
	return `${entry.date}: 達成率 ${Math.round(entry.completionRate * 100)}%`;
}

/**
 * oldest → newest の API データを、日曜始まり・週単位の列に変換する。
 * 先頭と末尾だけを埋める placeholder は実データとして公開しない。
 */
export function buildActivityLogWeeks(
	entries: ActivityLogEntry[],
): ActivityLogWeek[] {
	if (entries.length === 0) {
		return [];
	}

	const parsedEntries = entries.map((entry) => ({
		entry,
		date: parseDateOnly(entry.date),
	}));
	const cells: ActivityLogCell[] = [
		...Array.from(
			{ length: parsedEntries[0].date.weekday },
			(_, index): ActivityLogPlaceholderCell => ({
				kind: "placeholder",
				id: `leading-${index}`,
			}),
		),
		...parsedEntries.map<ActivityLogDataCell>(({ entry, date }) => ({
			kind: "data",
			entry,
			date,
			level: getActivityLogLevel(entry.completionRate),
		})),
	];
	const trailingPlaceholders =
		(DAYS_PER_WEEK - (cells.length % DAYS_PER_WEEK)) % DAYS_PER_WEEK;
	cells.push(
		...Array.from(
			{ length: trailingPlaceholders },
			(_, index): ActivityLogPlaceholderCell => ({
				kind: "placeholder",
				id: `trailing-${index}`,
			}),
		),
	);

	let previousMonth: string | undefined;
	return Array.from(
		{ length: cells.length / DAYS_PER_WEEK },
		(_, weekIndex): ActivityLogWeek => {
			const weekCells = cells.slice(
				weekIndex * DAYS_PER_WEEK,
				(weekIndex + 1) * DAYS_PER_WEEK,
			);
			const monthLabels: string[] = [];
			for (const cell of weekCells) {
				if (cell.kind !== "data") {
					continue;
				}
				const month = `${cell.date.year}-${cell.date.month}`;
				if (month !== previousMonth) {
					monthLabels.push(`${cell.date.month}月`);
					previousMonth = month;
				}
			}
			return {
				id: weekCells
					.map((cell) => (cell.kind === "data" ? cell.entry.date : cell.id))
					.join("-"),
				cells: weekCells,
				monthLabels,
			};
		},
	);
}

export function ActivityLog({ entries }: { entries: ActivityLogEntry[] }) {
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const hasInitialRightAlignment = useRef(false);
	const weeks = buildActivityLogWeeks(entries);

	useEffect(() => {
		if (
			weeks.length === 0 ||
			hasInitialRightAlignment.current ||
			!scrollAreaRef.current ||
			typeof window.matchMedia !== "function" ||
			!window.matchMedia(MOBILE_MEDIA_QUERY).matches
		) {
			return;
		}

		scrollAreaRef.current.scrollLeft = scrollAreaRef.current.scrollWidth;
		hasInitialRightAlignment.current = true;
	}, [weeks.length]);

	return (
		<section aria-label="Activity Log" className="w-full">
			<div className="mb-2 flex items-center gap-2 text-xs text-stone-600">
				<span>少ない</span>
				<ActivityLogLegend />
				<span>多い</span>
			</div>
			<div className="flex gap-2">
				<div
					aria-hidden="true"
					className="mt-[13px] grid h-[5.5rem] grid-rows-[repeat(7,0.625rem)] gap-[3px] text-[0.625rem] leading-[0.625rem] text-stone-500"
					data-testid="activity-log-weekday-labels"
				>
					<span className="row-start-2">月</span>
					<span className="row-start-4">水</span>
					<span className="row-start-6">金</span>
				</div>
				<div
					data-testid="activity-log-scroll-area"
					ref={scrollAreaRef}
					className="min-w-0 flex-1 overflow-x-auto pb-1"
				>
					<div className="min-w-[38rem]">
						<div
							aria-hidden="true"
							className="mb-[3px] grid h-2.5 gap-[3px] text-[0.625rem] leading-2.5 text-stone-500"
							style={{
								gridTemplateColumns: `repeat(${weeks.length}, 0.625rem)`,
							}}
						>
							{weeks.map((week) => (
								<div key={`month-${week.id}`} className="whitespace-nowrap">
									{week.monthLabels.map((label) => (
										<span key={label} data-testid="activity-log-month-label">
											{label}
										</span>
									))}
								</div>
							))}
						</div>
						{/* biome-ignore lint/a11y/useSemanticElements: 日付を週列で並べる非操作グラフにはWAI-ARIA gridを使う。 */}
						<div
							aria-colcount={weeks.length}
							aria-label="直近365日の達成率"
							aria-rowcount={DAYS_PER_WEEK}
							className="grid grid-rows-[repeat(7,0.625rem)] gap-[3px]"
							data-testid="activity-log-grid"
							role="grid"
						>
							{WEEKDAY_ROW_IDS.map((rowId, rowIndex) => (
								/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: 非操作の可視化グリッドで、行自体をTab stopにしない。 */
								<div
									aria-rowindex={rowIndex + 1}
									className="grid h-2.5 gap-[3px]"
									data-activity-week-row={rowIndex + 1}
									key={rowId}
									role="row"
									style={{
										gridTemplateColumns: `repeat(${weeks.length}, 0.625rem)`,
									}}
								>
									{weeks.map((week, columnIndex) => {
										const cell = week.cells[rowIndex];
										if (!cell) {
											return null;
										}

										return cell.kind === "placeholder" ? (
											<div
												aria-hidden="true"
												className="size-2.5"
												data-activity-placeholder="true"
												key={`${week.id}-${cell.id}`}
												role="presentation"
											/>
										) : (
											/* biome-ignore lint/a11y/useFocusableInteractive lint/a11y/useSemanticElements: セルは仕様上、情報提示専用でTab stopにしない。 */
											<div
												aria-label={getActivityLogAriaLabel(cell.entry)}
												aria-colindex={columnIndex + 1}
												aria-rowindex={rowIndex + 1}
												className="size-2.5 rounded-[2px] outline outline-1"
												data-activity-level={cell.level}
												key={cell.entry.date}
												role="gridcell"
												title={getActivityLogAriaLabel(cell.entry)}
											/>
										);
									})}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function ActivityLogLegend() {
	return (
		<span aria-hidden="true" className="flex gap-[3px]">
			{(
				["null", "zero", "level-1", "level-2", "level-3", "level-4"] as const
			).map((level) => (
				<span
					className="size-2.5 rounded-[2px] outline outline-1"
					data-activity-level={level}
					key={level}
				/>
			))}
		</span>
	);
}
