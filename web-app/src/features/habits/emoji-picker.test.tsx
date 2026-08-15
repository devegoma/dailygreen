import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { EmojiPicker } from "./emoji-picker";

describe("EmojiPicker", () => {
	it("候補外の既存ZWJ絵文字も現在値として保持し、未設定へ戻せる", async () => {
		const user = userEvent.setup();
		render(<PickerHarness initialValue="👨‍👩‍👧‍👦" />);

		const current = screen.getByRole("radio", {
			name: "現在設定中 👨‍👩‍👧‍👦",
		});
		expect(current).toBeChecked();
		expect(screen.getByText("👨‍👩‍👧‍👦", { selector: "span[aria-live]" })).toBeInTheDocument();

		await user.click(
			screen.getByRole("radio", { name: "絵文字を設定しない" }),
		);
		expect(
			screen.getByRole("radio", { name: "絵文字を設定しない" }),
		).toBeChecked();
		expect(screen.getByText("未設定")).toBeInTheDocument();
		expect(
			screen.queryByRole("radio", { name: "現在設定中 👨‍👩‍👧‍👦" }),
		).not.toBeInTheDocument();
	});

	it("候補を選ぶと選択状態と表示値を同時に更新する", async () => {
		const user = userEvent.setup();
		render(<PickerHarness />);

		await user.click(screen.getByRole("radio", { name: "いい習慣 👍🏽" }));
		expect(screen.getByRole("radio", { name: "いい習慣 👍🏽" })).toBeChecked();
		expect(screen.getByText("👍🏽", { selector: "span[aria-live]" })).toBeInTheDocument();
	});
});

function PickerHarness({ initialValue = "" }: { initialValue?: string }) {
	const [value, setValue] = useState(initialValue);
	return (
		<EmojiPicker id="test-emoji" onChange={setValue} value={value} />
	);
}
