import type {
	ActivityLogEntry,
	HomeDataResponse,
} from "~/features/home/home.contract";

const CARD_SIZE = 1080;
const GRID_COLUMNS = 53;
const GRID_ROWS = 7;
const GRID_CELL_SIZE = 12;
const GRID_GAP = 5;
const GRID_X = 92;
const GRID_Y = 548;

const ACTIVITY_COLORS = {
	null: "#f5f5f4",
	zero: "#9ca3af",
	level1: "#dcfce7",
	level2: "#4ade80",
	level3: "#15803d",
	level4: "#052e16",
} as const;

export type ShareSummary = {
	completedToday: number;
	totalHabits: number;
	longestCurrentStreak: number;
};

export function getShareSummary(home: HomeDataResponse): ShareSummary {
	return {
		completedToday: home.habits.filter((habit) => habit.isCompletedToday)
			.length,
		totalHabits: home.habits.length,
		longestCurrentStreak: home.habits.reduce(
			(max, habit) => Math.max(max, habit.currentStreak),
			0,
		),
	};
}

export function buildShareText(home: HomeDataResponse): string {
	const summary = getShareSummary(home);
	return [
		"Daily Green 🌱",
		`今日の習慣 ${summary.completedToday}/${summary.totalHabits} 達成`,
		`継続中の最長ストリーク ${summary.longestCurrentStreak}日`,
	].join("\n");
}

export function getShareActivityColor(completionRate: number | null): string {
	if (completionRate === null) {
		return ACTIVITY_COLORS.null;
	}
	if (completionRate === 0) {
		return ACTIVITY_COLORS.zero;
	}
	if (completionRate > 0 && completionRate <= 0.25) {
		return ACTIVITY_COLORS.level1;
	}
	if (completionRate > 0.25 && completionRate <= 0.5) {
		return ACTIVITY_COLORS.level2;
	}
	if (completionRate > 0.5 && completionRate < 1) {
		return ACTIVITY_COLORS.level3;
	}
	if (completionRate === 1) {
		return ACTIVITY_COLORS.level4;
	}
	throw new Error(`Invalid completion rate: ${completionRate}`);
}

function getUtcWeekday(date: string): number {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) {
		throw new Error(`Invalid full-date: ${date}`);
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	if (
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== day
	) {
		throw new Error(`Invalid full-date: ${date}`);
	}
	return parsed.getUTCDay();
}

function drawRoundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) {
	context.beginPath();
	context.moveTo(x + radius, y);
	context.lineTo(x + width - radius, y);
	context.quadraticCurveTo(x + width, y, x + width, y + radius);
	context.lineTo(x + width, y + height - radius);
	context.quadraticCurveTo(
		x + width,
		y + height,
		x + width - radius,
		y + height,
	);
	context.lineTo(x + radius, y + height);
	context.quadraticCurveTo(x, y + height, x, y + height - radius);
	context.lineTo(x, y + radius);
	context.quadraticCurveTo(x, y, x + radius, y);
	context.closePath();
}

function drawStat(
	context: CanvasRenderingContext2D,
	label: string,
	value: string,
	x: number,
) {
	drawRoundedRect(context, x, 278, 424, 160, 28);
	context.fillStyle = "#ffffff";
	context.fill();
	context.strokeStyle = "#e7e5e4";
	context.lineWidth = 2;
	context.stroke();

	context.fillStyle = "#57534e";
	context.font = "500 28px Inter, system-ui, sans-serif";
	context.fillText(label, x + 34, 326);
	context.fillStyle = "#0c0a09";
	context.font = "700 58px Inter, system-ui, sans-serif";
	context.fillText(value, x + 34, 396);
}

function drawActivityGrid(
	context: CanvasRenderingContext2D,
	entries: ActivityLogEntry[],
) {
	if (entries.length === 0) {
		return;
	}

	const leading = getUtcWeekday(entries[0].date);
	for (const [index, entry] of entries.entries()) {
		const position = leading + index;
		const column = Math.floor(position / GRID_ROWS);
		const row = position % GRID_ROWS;
		if (column >= GRID_COLUMNS) {
			continue;
		}
		const x = GRID_X + column * (GRID_CELL_SIZE + GRID_GAP);
		const y = GRID_Y + row * (GRID_CELL_SIZE + GRID_GAP);
		context.fillStyle = getShareActivityColor(entry.completionRate);
		drawRoundedRect(context, x, y, GRID_CELL_SIZE, GRID_CELL_SIZE, 3);
		context.fill();
	}
}

/** ブラウザ上だけで共有用PNGを生成する。サーバーや外部ストレージへデータを送らない。 */
export async function createShareCardBlob(
	home: HomeDataResponse,
): Promise<Blob> {
	if (typeof document === "undefined") {
		throw new Error("Share card can only be generated in a browser");
	}

	const canvas = document.createElement("canvas");
	canvas.width = CARD_SIZE;
	canvas.height = CARD_SIZE;
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Canvas 2D context is unavailable");
	}

	const summary = getShareSummary(home);
	context.fillStyle = "#fafaf9";
	context.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

	context.fillStyle = "#052e16";
	context.font = "700 62px Inter, system-ui, sans-serif";
	context.fillText("Daily Green", 92, 132);
	context.fillStyle = "#57534e";
	context.font = "500 30px Inter, system-ui, sans-serif";
	context.fillText("毎日の積み上げを、静かに育てる。", 92, 184);

	drawStat(
		context,
		"今日の達成",
		`${summary.completedToday} / ${summary.totalHabits}`,
		92,
	);
	drawStat(
		context,
		"継続中の最長ストリーク",
		`${summary.longestCurrentStreak}日`,
		564,
	);

	context.fillStyle = "#1c1917";
	context.font = "700 34px Inter, system-ui, sans-serif";
	context.fillText("直近365日の Activity Log", 92, 510);
	drawActivityGrid(context, home.activityLog);

	context.fillStyle = "#78716c";
	context.font = "500 24px Inter, system-ui, sans-serif";
	context.fillText("daily green • keep growing", 92, 982);

	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) {
				resolve(blob);
				return;
			}
			reject(new Error("Failed to encode share card"));
		}, "image/png");
	});
}
