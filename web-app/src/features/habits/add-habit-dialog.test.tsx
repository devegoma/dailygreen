import {
	QueryClient,
	QueryClientProvider,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeDataResponse } from "~/features/home/home.contract";
import { homeQueryOptions } from "~/features/home/home.query";
import { AddHabitDialog } from "./add-habit-dialog";

const fetchMock = vi.fn();

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("AddHabitDialog", () => {
	it("タスク追加から開き、習慣名へinitial focusを当ててアクセシブルな関連付けを持つ", async () => {
		const user = userEvent.setup();
		renderWithClient(<AddHabitDialog />);

		const trigger = screen.getByRole("button", { name: "+ タスク追加" });
		await user.click(trigger);

		expect(
			screen.getByRole("dialog", { name: "習慣を追加" }),
		).toBeInTheDocument();
		expect(screen.getByLabelText("習慣名")).toHaveFocus();
		expect(screen.getByLabelText("絵文字（任意）")).toHaveAttribute(
			"placeholder",
			"例: 📚",
		);
		expect(
			screen.getByText("毎日続けたい習慣を登録します。"),
		).toBeInTheDocument();
		expect(screen.getByLabelText("習慣名")).not.toHaveAttribute("maxLength");
		expect(screen.getByLabelText("絵文字（任意）")).not.toHaveAttribute(
			"maxLength",
		);
	});

	it("空文字・空白のみ・51グラフェムを検証し、失敗時はAPIを呼ばない", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", fetchMock);
		renderWithClient(<AddHabitDialog />);
		await openDialog(user);

		await user.click(screen.getByRole("button", { name: "追加" }));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"習慣名を入力してください",
		);
		expect(fetchMock).not.toHaveBeenCalled();

		const name = screen.getByLabelText("習慣名");
		await user.type(name, "読書");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		await user.clear(name);
		await user.type(name, "   ");
		await user.click(screen.getByRole("button", { name: "追加" }));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"習慣名を入力してください",
		);

		await user.clear(name);
		await user.type(name, "🌱".repeat(51));
		await user.click(screen.getByRole("button", { name: "追加" }));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"習慣名は50文字以内で入力してください",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("50グラフェム、通常・ZWJ・skin tone付きemojiを受け付ける", async () => {
		const user = userEvent.setup();
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation(() =>
				Promise.resolve(jsonResponse(habitResponse)),
			),
		);
		renderWithClient(<AddHabitDialog />);

		for (const emoji of ["📚", "👨‍👩‍👧‍👦", "👍🏽"]) {
			await openDialog(user);
			await user.type(screen.getByLabelText("習慣名"), "🌱".repeat(50));
			await user.type(screen.getByLabelText("絵文字（任意）"), emoji);
			await user.click(screen.getByRole("button", { name: "追加" }));
			await vi.waitFor(() =>
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
			);
		}

		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("複数絵文字と非絵文字を検証し、該当fieldの編集でerrorを消す", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", fetchMock);
		renderWithClient(<AddHabitDialog />);
		await openDialog(user);
		await user.type(screen.getByLabelText("習慣名"), "読書");
		const emoji = screen.getByLabelText("絵文字（任意）");
		await user.type(emoji, "📚📖");
		await user.click(screen.getByRole("button", { name: "追加" }));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"絵文字は1つだけ入力してください",
		);
		expect(emoji).toHaveAttribute("aria-invalid", "true");
		expect(emoji).toHaveAttribute("aria-describedby", "add-habit-emoji-error");

		await user.clear(emoji);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		await user.type(emoji, "読");
		await user.click(screen.getByRole("button", { name: "追加" }));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"絵文字を1つだけ入力してください",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("trim済みpayloadをPOSTし、Dialog closeとfocus復帰後にhomeを再取得する", async () => {
		const user = userEvent.setup();
		let homeRequestCount = 0;
		let resolveHomeRefetch: ((response: Response) => void) | undefined;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					if (homeRequestCount === 1) {
						return Promise.resolve(jsonResponse(homeData));
					}
					return new Promise<Response>((resolve) => {
						resolveHomeRefetch = resolve;
					});
				}
				return Promise.resolve(jsonResponse(habitResponse));
			}),
		);
		renderWithClient(<AddHabitDialogWithActiveHome />);
		await vi.waitFor(() => expect(homeRequestCount).toBe(1));
		await openDialog(user);
		const trigger = screen.getByRole("button", {
			name: "+ タスク追加",
			hidden: true,
		});
		await user.type(screen.getByLabelText("習慣名"), "  読書  ");
		await user.type(screen.getByLabelText("絵文字（任意）"), "📚");
		await user.click(screen.getByRole("button", { name: "追加" }));

		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(trigger).toHaveFocus();
		await vi.waitFor(() => expect(homeRequestCount).toBe(2));
		resolveHomeRefetch?.(jsonResponse(homeData));
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/habits",
			expect.objectContaining({
				body: JSON.stringify({ name: "読書", emoji: "📚" }),
				method: "POST",
			}),
		);
	});

	it("pending中は二重送信とEsc・外側clickによるcloseを防ぎ、操作をdisabledにする", async () => {
		const user = userEvent.setup();
		const create = deferred<Response>();
		vi.stubGlobal("fetch", fetchMock.mockReturnValue(create.promise));
		renderWithClient(<AddHabitDialog />);
		await openDialog(user);
		await user.type(screen.getByLabelText("習慣名"), "読書");
		const submit = screen.getByRole("button", { name: "追加" });
		await user.dblClick(submit);

		await vi.waitFor(() =>
			expect(
				screen.getByRole("button", { name: "追加しています…" }),
			).toBeDisabled(),
		);
		expect(screen.getByLabelText("習慣名")).toBeDisabled();
		expect(screen.getByLabelText("絵文字（任意）")).toBeDisabled();
		expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
		expect(
			fetchMock.mock.calls.filter(([path]) => path === "/api/habits"),
		).toHaveLength(1);

		await user.keyboard("{Escape}");
		await user.click(dialogOverlay());
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		await act(async () => {
			create.resolve(jsonResponse(habitResponse));
		});
		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});

	it.each([
		["HABIT_LIMIT_EXCEEDED", 409, "これ以上、習慣を作成できません"],
		[
			"INTERNAL_SERVER_ERROR",
			500,
			"処理に失敗しました。時間をおいて再試行してください",
		],
		["INVALID_REQUEST", 400, "安全なAPIメッセージ"],
	] as const)(
		"%s の失敗ではDialogと入力を維持してエラーを表示する",
		async (code, status, message) => {
			const user = userEvent.setup();
			vi.stubGlobal(
				"fetch",
				fetchMock.mockResolvedValue(jsonResponse({ code, message }, status)),
			);
			renderWithClient(<AddHabitDialog />);
			await openDialog(user);
			await user.type(screen.getByLabelText("習慣名"), "読書");
			await user.click(screen.getByRole("button", { name: "追加" }));

			expect(await screen.findByRole("alert")).toHaveTextContent(message);
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			expect(screen.getByLabelText("習慣名")).toHaveValue("読書");
		},
	);

	it("network errorを表示し、401はDialog内alertを出さずglobal auth handlingへ委譲する", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", fetchMock.mockRejectedValue(new Error("offline")));
		renderWithClient(<AddHabitDialog />);
		await openDialog(user);
		await user.type(screen.getByLabelText("習慣名"), "読書");
		await user.click(screen.getByRole("button", { name: "追加" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"通信に失敗しました。接続を確認して再試行してください",
		);

		cleanup();
		const onUnauthorized = vi.fn();
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValue(
				jsonResponse(
					{ code: "UNAUTHORIZED", message: "ログインが必要です。" },
					401,
				),
			),
		);
		renderWithClient(<AddHabitDialog onUnauthorized={onUnauthorized} />);
		await openDialog(user);
		await user.type(screen.getByLabelText("習慣名"), "読書");
		await user.click(screen.getByRole("button", { name: "追加" }));
		await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("通常のCancel・Esc・外側clickは値とerrorをresetし、triggerへfocusを戻す", async () => {
		const user = userEvent.setup();
		renderWithClient(<AddHabitDialog />);
		const trigger = screen.getByRole("button", { name: "+ タスク追加" });

		await openDialog(user);
		await user.type(screen.getByLabelText("習慣名"), "読書");
		await user.click(screen.getByRole("button", { name: "キャンセル" }));
		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(trigger).toHaveFocus();

		await openDialog(user);
		expect(screen.getByLabelText("習慣名")).toHaveValue("");
		await user.type(screen.getByLabelText("習慣名"), "読書");
		await user.keyboard("{Escape}");
		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(trigger).toHaveFocus();

		await openDialog(user);
		await user.type(screen.getByLabelText("習慣名"), "読書");
		await user.click(dialogOverlay());
		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(trigger).toHaveFocus();
		await openDialog(user);
		expect(screen.getByLabelText("習慣名")).toHaveValue("");
	});
});

function AddHabitDialogWithActiveHome() {
	const queryClient = useQueryClient();
	useQuery(homeQueryOptions({ enabled: true }, queryClient));
	return <AddHabitDialog />;
}

function openDialog(user: ReturnType<typeof userEvent.setup>) {
	return user.click(screen.getByRole("button", { name: "+ タスク追加" }));
}

function dialogOverlay(): HTMLElement {
	const overlay = screen.getByRole("dialog").previousElementSibling;
	if (!(overlay instanceof HTMLElement)) {
		throw new Error("Dialog overlay was not rendered.");
	}
	return overlay;
}

function renderWithClient(ui: React.ReactElement) {
	return render(ui, { wrapper: wrapper(createQueryClient()) });
}

function wrapper(queryClient: QueryClient) {
	return function QueryWrapper({ children }: PropsWithChildren) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	};
}

function createQueryClient(): QueryClient {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const habitResponse = {
	id: "habit-1",
	name: "読書",
	emoji: "📚",
	currentStreak: 0,
	maxStreak: 0,
	createdAt: "2026-08-08T12:00:00+09:00",
	archivedAt: null,
};

const homeData: HomeDataResponse = {
	habits: [],
	activityLog: [{ date: "2026-08-08", completionRate: null }],
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}
