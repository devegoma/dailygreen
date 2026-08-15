import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { EmojiPicker } from "./emoji-picker";

afterEach(() => {
	cleanup();
});

describe("EmojiPicker", () => {
	it("候補外の既存ZWJ絵文字も直接入力欄で保持し、未設定へ戻せる", async () => {
		const user = userEvent.setup();
		render(<PickerHarness initialValue="👨‍👩‍👧‍👦" />);

		expect(screen.getByLabelText("絵文字を直接入力")).toHaveValue(
			"👨‍👩‍👧‍👦",
		);
		expect(
			screen.getByText("👨‍👩‍👧‍👦", { selector: "span[aria-live]" }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("radio", { name: "絵文字を設定しない" }));
		expect(
			screen.getByRole("radio", { name: "絵文字を設定しない" }),
		).toBeChecked();
		expect(screen.getByLabelText("絵文字を直接入力")).toHaveValue("");
		expect(screen.getByText("未設定")).toBeInTheDocument();
	});

	it("候補にない絵文字も直接入力して表示値を更新できる", async () => {
		const user = userEvent.setup();
		render(<PickerHarness />);
		const input = screen.getByLabelText("絵文字を直接入力");

		await user.type(input, "👨‍👩‍👧‍👦");

		expect(input).toHaveValue("👨‍👩‍👧‍👦");
		expect(
			screen.getByText("👨‍👩‍👧‍👦", { selector: "span[aria-live]" }),
		).toBeInTheDocument();
	});

	it("候補を選ぶと選択状態と表示値を同時に更新する", async () => {
		const user = userEvent.setup();
		render(<PickerHarness />);

		await user.click(screen.getByRole("radio", { name: "いい習慣 👍🏽" }));
		expect(screen.getByRole("radio", { name: "いい習慣 👍🏽" })).toBeChecked();
		expect(screen.getByLabelText("絵文字を直接入力")).toHaveValue("👍🏽");
		expect(
			screen.getByText("👍🏽", { selector: "span[aria-live]" }),
		).toBeInTheDocument();
	});

	it("方向キーで6列グリッドの見た目どおり上下左右へ移動する", async () => {
		const user = userEvent.setup();
		render(<PickerHarness />);
		const first = screen.getByRole("radio", { name: "新しい習慣 🌱" });
		first.focus();

		await user.keyboard("{ArrowDown}");
		const below = screen.getByRole("radio", { name: "目標 🎯" });
		expect(below).toBeChecked();
		expect(below).toHaveFocus();

		await user.keyboard("{ArrowUp}");
		expect(first).toBeChecked();
		expect(first).toHaveFocus();

		await user.keyboard("{ArrowRight}");
		const right = screen.getByRole("radio", { name: "読書 📚" });
		expect(right).toBeChecked();
		expect(right).toHaveFocus();
	});
});

function PickerHarness({ initialValue = "" }: { initialValue?: string }) {
	const [value, setValue] = useState(initialValue);
	return <EmojiPicker id="test-emoji" onChange={setValue} value={value} />;
}
