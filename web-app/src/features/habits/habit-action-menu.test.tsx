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
import type { HomeHabit } from "~/features/home/home.contract";
import { homeQueryOptions } from "~/features/home/home.query";
import { HabitActionMenu } from "./habit-action-menu";
import { HabitList } from "./habit-list";
import { habitMutationKey } from "./habits.mutations";

const fetchMock = vi.fn();

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("HabitActionMenu", () => {
	it("habit名を含むmenuをmouseとkeyboardで操作し、編集Dialogへfocusを移す", async () => {
		const user = userEvent.setup();
		renderWithClient(<HabitActionMenu habit={makeHabit()} />);
		const trigger = screen.getByRole("button", { name: "読書 の操作メニュー" });
		await user.click(trigger);
		expect(screen.getByRole("menuitem", { name: "編集" })).toBeInTheDocument();
		expect(
			screen.getByRole("menuitem", { name: "アーカイブ" }),
		).toBeInTheDocument();

		await user.keyboard("{ArrowDown}{Enter}");
		expect(
			screen.getByRole("dialog", { name: "習慣を編集" }),
		).toBeInTheDocument();
		expect(screen.getByLabelText("習慣名")).toHaveFocus();
		expect(screen.getByLabelText("習慣名")).toHaveValue("読書");
		expect(screen.getByRole("radio", { name: "読書 📚" })).toBeChecked();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});

	it("編集ではshared validationを使い、emojiの空文字を含む両fieldのPATCH payloadを送る", async () => {
		const user = userEvent.setup();
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValue(jsonResponse(habitResponse({ emoji: "" }))),
		);
		renderWithClient(<HabitActionMenu habit={makeHabit()} />);
		await openMenuItem(user, "編集");
		const name = screen.getByLabelText("習慣名");
		await user.clear(name);
		await user.click(screen.getByRole("button", { name: "保存" }));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"習慣名を入力してください",
		);
		expect(fetchMock).not.toHaveBeenCalled();
		await user.type(name, "  毎日読む  ");
		await user.click(
			screen.getByRole("radio", { name: "絵文字を設定しない" }),
		);
		await user.click(screen.getByRole("button", { name: "保存" }));
		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/habits/reading",
			expect.objectContaining({
				method: "PATCH",
				body: JSON.stringify({ name: "毎日読む", emoji: "" }),
			}),
		);
	});

	it("no-op updateも成功として扱い、Dialog closeとfocus復帰後にactive homeをrefetchする", async () => {
		const user = userEvent.setup();
		const refetch = deferred<Response>();
		let homeCalls = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeCalls += 1;
					return homeCalls === 1
						? Promise.resolve(jsonResponse(homeData()))
						: refetch.promise;
				}
				return Promise.resolve(jsonResponse(habitResponse()));
			}),
		);
		const client = createQueryClient();
		render(<ActiveHomeMenu />, { wrapper: wrapper(client) });
		await screen.findByRole("button", { name: "読書 の操作メニュー" });
		await openMenuItem(user, "編集");
		const trigger = screen.getByRole("button", {
			name: "読書 の操作メニュー",
			hidden: true,
		});
		await user.click(screen.getByRole("button", { name: "保存" }));
		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(trigger).toHaveFocus();
		await vi.waitFor(() => expect(homeCalls).toBe(2));
		refetch.resolve(jsonResponse(homeData()));
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/habits/reading",
			expect.objectContaining({
				body: JSON.stringify({ name: "読書", emoji: "📚" }),
			}),
		);
	});

	it("アーカイブ確認の正確な文言・idempotent 200・pathを扱う", async () => {
		const user = userEvent.setup();
		vi.stubGlobal(
			"fetch",
			fetchMock.mockResolvedValue(
				jsonResponse(
					habitResponse({ archivedAt: "2026-08-08T00:00:00+09:00" }),
				),
			),
		);
		renderWithClient(<HabitActionMenu habit={makeHabit()} />);
		await openMenuItem(user, "アーカイブ");
		expect(
			screen.getByRole("dialog", { name: "「読書」をアーカイブしますか？" }),
		).toHaveTextContent(
			"アーカイブした習慣は今日の習慣に表示されなくなります。",
		);
		expect(screen.getByRole("dialog")).toHaveTextContent(
			"アーカイブ済み習慣の復元 UI はありません。",
		);
		expect(screen.getByRole("dialog")).not.toHaveTextContent("削除");
		await user.click(screen.getByRole("button", { name: "アーカイブする" }));
		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/habits/reading/archive",
			expect.objectContaining({ method: "PATCH" }),
		);
	});

	it("アーカイブ成功はcloseとtrigger focus後にrefetchし、card消滅後は一覧へfocusを移す", async () => {
		const user = userEvent.setup();
		const refetch = deferred<Response>();
		let homeCalls = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeCalls += 1;
					return homeCalls === 1
						? Promise.resolve(jsonResponse(homeData()))
						: refetch.promise;
				}
				return Promise.resolve(jsonResponse(habitResponse()));
			}),
		);
		const client = createQueryClient();
		render(<ActiveHomeHabitList />, { wrapper: wrapper(client) });
		const trigger = await screen.findByRole("button", {
			name: "読書 の操作メニュー",
		});
		await openMenuItem(user, "アーカイブ");
		await user.click(screen.getByRole("button", { name: "アーカイブする" }));

		await vi.waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(trigger).toHaveFocus();
		await vi.waitFor(() => expect(homeCalls).toBe(2));
		refetch.resolve(jsonResponse(homeData([])));
		await screen.findByText("今日の習慣はまだありません。");
		await vi.waitFor(() =>
			expect(screen.getByRole("region", { name: "今日の習慣" })).toHaveFocus(),
		);
	});

	it("アーカイブ後のrefetch中に別controlへ移したfocusを完了時に奪わない", async () => {
		const user = userEvent.setup();
		const refetch = deferred<Response>();
		const walk = makeHabit({ id: "walk", name: "散歩", emoji: "🚶" });
		let homeCalls = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeCalls += 1;
					return homeCalls === 1
						? Promise.resolve(jsonResponse(homeData([makeHabit(), walk])))
						: refetch.promise;
				}
				return Promise.resolve(jsonResponse(habitResponse()));
			}),
		);
		const client = createQueryClient();
		render(<ActiveHomeHabitList />, { wrapper: wrapper(client) });
		await screen.findByRole("button", { name: "読書 の操作メニュー" });
		await openMenuItem(user, "アーカイブ");
		await user.click(screen.getByRole("button", { name: "アーカイブする" }));
		await vi.waitFor(() => expect(homeCalls).toBe(2));
		const nextControl = screen.getByRole("button", { name: "散歩を達成する" });
		nextControl.focus();
		expect(nextControl).toHaveFocus();

		refetch.resolve(jsonResponse(homeData([walk])));
		await vi.waitFor(() =>
			expect(
				screen.queryByRole("button", { name: "読書を達成する" }),
			).not.toBeInTheDocument(),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(nextControl).toHaveFocus();
	});

	it.each([
		["編集", "HABIT_ARCHIVED", 409, "この習慣はすでにアーカイブされています"],
		["編集", "HABIT_NOT_FOUND", 404, "習慣が見つかりません"],
		["アーカイブ", "HABIT_NOT_FOUND", 404, "習慣が見つかりません"],
		[
			"アーカイブ",
			"INTERNAL_SERVER_ERROR",
			500,
			"処理に失敗しました。時間をおいて再試行してください",
		],
	] as const)(
		"%s の %s をDialog内に表示して値を維持する",
		async (action, code, status, message) => {
			const user = userEvent.setup();
			vi.stubGlobal(
				"fetch",
				fetchMock.mockResolvedValue(
					jsonResponse({ code, message: "API message" }, status),
				),
			);
			renderWithClient(<HabitActionMenu habit={makeHabit()} />);
			await openMenuItem(user, action);
			if (action === "編集") {
				await user.clear(screen.getByLabelText("習慣名"));
				await user.type(screen.getByLabelText("習慣名"), "変更後");
				await user.click(screen.getByRole("button", { name: "保存" }));
				expect(await screen.findByRole("alert")).toHaveTextContent(message);
				expect(screen.getByLabelText("習慣名")).toHaveValue("変更後");
			} else {
				await user.click(
					screen.getByRole("button", { name: "アーカイブする" }),
				);
				expect(await screen.findByRole("alert")).toHaveTextContent(message);
			}
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		},
	);

	it("401はDialog内alertを出さずglobal auth handlingへ委譲する", async () => {
		const user = userEvent.setup();
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
		renderWithClient(
			<HabitActionMenu habit={makeHabit()} onUnauthorized={onUnauthorized} />,
		);
		await openMenuItem(user, "編集");
		await user.click(screen.getByRole("button", { name: "保存" }));
		await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it.each([
		[
			"編集",
			"/api/habits/reading",
			"保存",
			"HABIT_ARCHIVED",
			409,
			"この習慣はすでにアーカイブされています",
		],
		[
			"アーカイブ",
			"/api/habits/reading/archive",
			"アーカイブする",
			"HABIT_NOT_FOUND",
			404,
			"習慣が見つかりません",
		],
	] as const)(
		"%s のstale-state errorは再同期成功まで表示し、成功後にDialog内から消える",
		async (action, path, submitLabel, code, status, message) => {
			const user = userEvent.setup();
			const refetch = deferred<Response>();
			let homeCalls = 0;
			vi.stubGlobal(
				"fetch",
				fetchMock.mockImplementation((requestPath: string) => {
					if (requestPath === "/api/home") {
						homeCalls += 1;
						return homeCalls === 1
							? Promise.resolve(jsonResponse(homeData()))
							: refetch.promise;
					}
					expect(requestPath).toBe(path);
					return Promise.resolve(
						jsonResponse({ code, message: "API message" }, status),
					);
				}),
			);
			const client = createQueryClient();
			render(<ActiveHomeMenu />, { wrapper: wrapper(client) });
			await screen.findByRole("button", { name: "読書 の操作メニュー" });
			await openMenuItem(user, action);
			await user.click(screen.getByRole("button", { name: submitLabel }));
			expect(await screen.findByRole("alert")).toHaveTextContent(message);
			await vi.waitFor(() => expect(homeCalls).toBe(2));
			expect(
				screen.getByRole("button", { name: "状態を確認しています…" }),
			).toBeDisabled();
			refetch.resolve(jsonResponse(homeData()));
			await vi.waitFor(() =>
				expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
			);
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		},
	);

	it("pending中は同じhabitのmenuとDialog close・二重送信を抑止し、別habitは操作できる", async () => {
		const user = userEvent.setup();
		const archive = deferred<Response>();
		vi.stubGlobal("fetch", fetchMock.mockReturnValue(archive.promise));
		renderWithClient(
			<>
				<HabitActionMenu habit={makeHabit()} />
				<HabitActionMenu habit={makeHabit({ id: "walk", name: "散歩" })} />
			</>,
		);
		await openMenuItem(user, "アーカイブ");
		const submit = screen.getByRole("button", { name: "アーカイブする" });
		await user.dblClick(submit);
		await vi.waitFor(() =>
			expect(
				screen.getByRole("button", { name: "アーカイブしています…" }),
			).toBeDisabled(),
		);
		expect(
			screen.getByRole("button", { name: "読書 の操作メニュー", hidden: true }),
		).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "散歩 の操作メニュー", hidden: true }),
		).toBeEnabled();
		await user.keyboard("{Escape}");
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(
				fetchMock.mock.calls.filter(
					([path]) => path === "/api/habits/reading/archive",
				),
			).toHaveLength(1),
		);
		await act(async () => archive.resolve(jsonResponse(habitResponse())));
	});

	it("アーカイブ送信と同一turnの二重click・Escapeでも1回だけ送信しDialogを閉じない", async () => {
		const user = userEvent.setup();
		const archive = deferred<Response>();
		vi.stubGlobal("fetch", fetchMock.mockReturnValue(archive.promise));
		renderWithClient(<HabitActionMenu habit={makeHabit()} />);
		await openMenuItem(user, "アーカイブ");
		const submit = screen.getByRole("button", { name: "アーカイブする" });

		act(() => {
			submit.click();
			submit.click();
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			);
		});

		await vi.waitFor(() =>
			expect(
				fetchMock.mock.calls.filter(
					([path]) => path === "/api/habits/reading/archive",
				),
			).toHaveLength(1),
		);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(
				screen.getByRole("button", { name: "アーカイブしています…" }),
			).toBeDisabled(),
		);
		await act(async () => archive.resolve(jsonResponse(habitResponse())));
	});

	it("同一habitの既存mutation中はmenuを無効化する", async () => {
		const pending = deferred<void>();
		const client = createQueryClient();
		const mutation = client.getMutationCache().build(client, {
			mutationKey: habitMutationKey("reading", "complete"),
			mutationFn: () => pending.promise,
		});
		const execution = mutation.execute(undefined);
		render(<HabitActionMenu habit={makeHabit()} />, {
			wrapper: wrapper(client),
		});
		await vi.waitFor(() =>
			expect(
				screen.getByRole("button", { name: "読書 の操作メニュー" }),
			).toBeDisabled(),
		);
		pending.resolve();
		await execution;
	});

	it("updateのstale再同期中はCompleteButtonが共有状態を見てPOSTを開始しない", async () => {
		const user = userEvent.setup();
		const refetch = deferred<Response>();
		let homeCalls = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeCalls += 1;
					return homeCalls === 1
						? Promise.resolve(jsonResponse(homeData()))
						: refetch.promise;
				}
				if (path === "/api/habits/reading") {
					return Promise.resolve(
						jsonResponse(
							{ code: "HABIT_ARCHIVED", message: "API message" },
							409,
						),
					);
				}
				return Promise.resolve(jsonResponse({}));
			}),
		);
		const client = createQueryClient();
		render(<ActiveHomeHabitList />, { wrapper: wrapper(client) });
		await screen.findByRole("button", { name: "読書 の操作メニュー" });
		await openMenuItem(user, "編集");
		await user.click(screen.getByRole("button", { name: "保存" }));
		await vi.waitFor(() => expect(homeCalls).toBe(2));
		const complete = screen.getByRole("button", {
			name: "読書を最新状態を確認しています",
			hidden: true,
		});
		expect(complete).toBeDisabled();
		expect(complete).toHaveAttribute("aria-busy", "true");
		complete.click();
		expect(
			fetchMock.mock.calls.filter(
				([path]) => path === "/api/habits/reading/complete",
			),
		).toHaveLength(0);
		refetch.resolve(jsonResponse(homeData()));
	});
});

function ActiveHomeMenu() {
	const client = useQueryClient();
	const home = useQuery(homeQueryOptions({ enabled: true }, client));
	return home.data ? (
		<HabitActionMenu habit={home.data.habits[0]} />
	) : (
		<p>読み込み中…</p>
	);
}

function ActiveHomeHabitList() {
	const client = useQueryClient();
	const home = useQuery(homeQueryOptions({ enabled: true }, client));
	return home.data ? (
		<HabitList habits={home.data.habits} />
	) : (
		<p>読み込み中…</p>
	);
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
function createQueryClient() {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function makeHabit(overrides: Partial<HomeHabit> = {}): HomeHabit {
	return {
		id: "reading",
		name: "読書",
		emoji: "📚",
		currentStreak: 3,
		maxStreak: 14,
		isCompletedToday: false,
		...overrides,
	};
}
function habitResponse(overrides: Record<string, unknown> = {}) {
	return {
		id: "reading",
		name: "読書",
		emoji: "📚",
		currentStreak: 3,
		maxStreak: 14,
		createdAt: "2026-08-08T00:00:00+09:00",
		archivedAt: null,
		...overrides,
	};
}
function homeData(habits: HomeHabit[] = [makeHabit()]) {
	return {
		habits,
		activityLog: [{ date: "2026-08-08", completionRate: null }],
	};
}
function jsonResponse(body: unknown, status = 200) {
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
async function openMenuItem(
	user: ReturnType<typeof userEvent.setup>,
	name: "編集" | "アーカイブ",
) {
	await user.click(screen.getByRole("button", { name: "読書 の操作メニュー" }));
	await user.click(screen.getByRole("menuitem", { name }));
}
