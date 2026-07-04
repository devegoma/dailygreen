export const JST_TIME_ZONE = "Asia/Tokyo";

type DateParts = {
	year: string;
	month: string;
	day: string;
	hour?: string;
	minute?: string;
	second?: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
	timeZone: JST_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
	timeZone: JST_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
});

function partsToRecord(parts: Intl.DateTimeFormatPart[]): DateParts {
	return Object.fromEntries(
		parts
			.filter((part) => part.type !== "literal")
			.map((part) => [part.type, part.value]),
	) as DateParts;
}

export function toJstDateString(date = new Date()): string {
	const parts = partsToRecord(dateFormatter.formatToParts(date));
	return `${parts.year}-${parts.month}-${parts.day}`;
}

export function toJstDateTimeString(date = new Date()): string {
	const parts = partsToRecord(dateTimeFormatter.formatToParts(date));
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}

export function getJstDateContext(date = new Date()): {
	today: string;
	yesterday: string;
} {
	return {
		today: toJstDateString(date),
		yesterday: addDaysToJstDateString(toJstDateString(date), -1),
	};
}

export function addDaysToJstDateString(date: string, days: number): string {
	const [year, month, day] = date.split("-").map(Number);
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	utcDate.setUTCDate(utcDate.getUTCDate() + days);
	return utcDate.toISOString().slice(0, 10);
}
