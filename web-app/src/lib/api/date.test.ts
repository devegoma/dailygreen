import assert from "node:assert/strict";
import {
	addDaysToJstDateString,
	getJstDateContext,
	toJstDateString,
	toJstDateTimeString,
} from "./date";

export function testFormatsJstDateAcrossUtcBoundary() {
	assert.equal(
		toJstDateString(new Date("2024-11-19T15:00:00.000Z")),
		"2024-11-20",
	);
}

export function testFormatsJstDateTimeWithFixedOffset() {
	assert.equal(
		toJstDateTimeString(new Date("2024-11-19T15:00:00.000Z")),
		"2024-11-20T00:00:00+09:00",
	);
}

export function testBuildsJstDateContext() {
	assert.deepEqual(getJstDateContext(new Date("2024-01-01T00:00:00.000Z")), {
		today: "2024-01-01",
		yesterday: "2023-12-31",
	});
}

export function testAddsDaysToJstDateString() {
	assert.equal(addDaysToJstDateString("2024-02-28", 1), "2024-02-29");
	assert.equal(addDaysToJstDateString("2024-03-01", -1), "2024-02-29");
}
