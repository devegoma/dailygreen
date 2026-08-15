import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityLog } from "./activity-log";

afterEach(() => {
	cleanup();
});

describe("ActivityLog mobile edge spacing", () => {
	it("スクロール内容を実幅で保持し、両端セルのoutline用余白を確保する", () => {
		render(
			<ActivityLog
				entries={[{ date: "2026-08-15", completionRate: 1 }]}
			/>,
		);

		expect(screen.getByTestId("activity-log-scroll-area")).toHaveClass(
			"overflow-x-auto",
		);
		expect(screen.getByTestId("activity-log-scroll-content")).toHaveClass(
			"w-max",
			"min-w-full",
			"px-px",
		);
	});
});
