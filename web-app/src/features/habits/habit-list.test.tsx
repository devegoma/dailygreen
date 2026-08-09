import {
	QueryClient,
	QueryClientProvider,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type PropsWithChildren, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	HomeDataResponse,
	HomeHabit,
} from "~/features/home/home.contract";
import { homeQueryKey, homeQueryOptions } from "~/features/home/home.query";
import { HabitList } from "./habit-list";
import { habitMutationKey } from "./habits.mutations";
import { TodaySummary } from "./today-summary";

const fetchMock = vi.fn();

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("TodaySummary と HabitList", () => {
	it("API返却順、絵文字、ストリーク、達成状態を仕様どおり表示する", () => {
		const habits = [
			makeHabit({
				id: "second",
				name: "後の習慣",
				emoji: "",
				currentStreak: 0,
				maxStreak: 2,
			}),
			makeHabit({
				id: "first",
				name: "先の習慣",
				emoji: "📚",
				currentStreak: 3,
				maxStreak: 14,
				isCompletedToday: true,
			}),
		];
		renderWithClient(
			<>
				<TodaySummary habits={habits} />
				<HabitList habits={habits} />
			</>,
		);

		expect(screen.getByTestId("today-summary")).toHaveTextContent("1 / 2 完了");
		expect(
			screen
				.getAllByRole("heading", { level: 3 })
				.map((heading) => heading.textContent),
		).toEqual(["後の習慣", "📚先の習慣"]);
		expect(screen.getByText("現在 0日 ・ 最長 2日")).toBeInTheDocument();
		expect(screen.getByText("現在 3日 ・ 最長 14日")).toBeInTheDocument();
		expect(screen.queryByText("⬜")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "先の習慣を達成済み" }),
		).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "後の習慣を達成する" }),
		).toHaveClass("w-full", "sm:w-auto");
		expect(document.querySelector('[data-completed="true"]')).toHaveClass(
			"bg-emerald-50",
			"border-emerald-200",
		);
		expect(
			screen.getByRole("button", { name: "後の習慣 の操作メニュー" }),
		).toBeEnabled();
		expect(
			screen.getByRole("button", { name: "先の習慣 の操作メニュー" }),
		).toBeEnabled();
	});

	it("対象習慣がない場合は空状態だけを表示し、0 / 0 完了を表示しない", () => {
		renderWithClient(
			<>
				<TodaySummary habits={[]} />
				<HabitList habits={[]} />
			</>,
		);

		expect(
			screen.getByText("今日の習慣はまだありません。"),
		).toBeInTheDocument();
		expect(
			screen.getByText("まずは小さな習慣を1つ追加しましょう。"),
		).toBeInTheDocument();
		expect(screen.queryByTestId("today-summary")).not.toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("達成済み習慣はAPIを呼ばず、同一習慣の別mutation中もcompleteを開始しない", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", fetchMock);
		const queryClient = createQueryClient();
		const completed = render(
			<HabitList habits={[makeHabit({ isCompletedToday: true })]} />,
			{ wrapper: wrapper(queryClient) },
		);
		await user.click(screen.getByRole("button", { name: "読書を達成済み" }));
		expect(fetchMock).not.toHaveBeenCalled();
		completed.unmount();

		const pending = deferred<void>();
		const updateMutation = queryClient.getMutationCache().build(queryClient, {
			mutationKey: habitMutationKey("reading", "update"),
			mutationFn: () => pending.promise,
		});
		const updateExecution = updateMutation.execute(undefined);
		render(<HabitList habits={[makeHabit()]} />, {
			wrapper: wrapper(queryClient),
		});
		await vi.waitFor(() =>
			expect(
				screen.getByRole("button", { name: "読書を達成する" }),
			).toBeDisabled(),
		);
		await user.click(screen.getByRole("button", { name: "読書を達成する" }));
		expect(fetchMock).not.toHaveBeenCalled();
		pending.resolve();
		await updateExecution;
	});

	it("対象の習慣だけをpendingにして二重送信を防ぎ、成功時にsummaryとcardを更新する", async () => {
		const user = userEvent.setup();
		const initialHome = makeHomeData();
		const complete = deferred<Response>();
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					return Promise.resolve(jsonResponse(initialHome));
				}
				return complete.promise;
			}),
		);
		const queryClient = createQueryClient();
		render(<HomeHabitList />, { wrapper: wrapper(queryClient) });
		await screen.findByText("1 / 3 完了");

		const readingButton = screen.getByRole("button", {
			name: "読書を達成する",
		});
		const exerciseButton = screen.getByRole("button", {
			name: "運動を達成する",
		});
		const activityLogBeforeComplete =
			queryClient.getQueryData<HomeDataResponse>(homeQueryKey)?.activityLog;
		await user.dblClick(readingButton);

		expect(
			fetchMock.mock.calls.filter(
				([path]) => path === "/api/habits/reading/complete",
			),
		).toHaveLength(1);
		expect(
			screen.getByRole("button", { name: "読書を達成しています" }),
		).toHaveTextContent("達成しています…");
		expect(
			screen.getByRole("button", { name: "読書を達成しています" }),
		).toHaveAttribute("aria-busy", "true");
		expect(exerciseButton).not.toBeDisabled();

		await act(async () => {
			complete.resolve(jsonResponse(completeResponse("reading")));
		});
		await screen.findByText("2 / 3 完了");
		expect(screen.getByTestId("today-summary")).toHaveAttribute(
			"aria-live",
			"polite",
		);
		expect(
			screen.getByRole("button", { name: "読書を達成済み" }),
		).toBeDisabled();
		expect(
			queryClient.getQueryData<HomeDataResponse>(homeQueryKey)?.activityLog,
		).toBe(activityLogBeforeComplete);
	});

	it.each([
		["HABIT_ALREADY_COMPLETED_TODAY", 409, "この習慣は本日すでに達成済みです"],
		["HABIT_ARCHIVED", 409, "この習慣はすでにアーカイブされています"],
		["HABIT_NOT_FOUND", 404, "習慣が見つかりません"],
		[
			"INTERNAL_SERVER_ERROR",
			500,
			"処理に失敗しました。時間をおいて再試行してください",
		],
	] as const)(
		"%s をカード付近のrole=alertで表示する",
		async (code, status, message) => {
			const user = userEvent.setup();
			vi.stubGlobal(
				"fetch",
				fetchMock.mockResolvedValue(
					jsonResponse({ code, message: "APIの任意文言" }, status),
				),
			);
			renderWithClient(<HabitList habits={[makeHabit()]} />);

			await user.click(screen.getByRole("button", { name: "読書を達成する" }));
			expect(await screen.findByRole("alert")).toHaveTextContent(message);
		},
	);

	it("network errorをカード付近のrole=alertで表示する", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", fetchMock.mockRejectedValue(new Error("offline")));
		renderWithClient(<HabitList habits={[makeHabit()]} />);

		await user.click(screen.getByRole("button", { name: "読書を達成する" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"通信に失敗しました。接続を確認して再試行してください",
		);
	});

	it("401はカードエラーを出さずglobal auth callbackへ委譲する", async () => {
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
			<HabitList habits={[makeHabit()]} onUnauthorized={onUnauthorized} />,
		);

		await user.click(screen.getByRole("button", { name: "読書を達成する" }));
		await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("stale-state errorは成功したhome再同期後にだけ消去する", async () => {
		const user = userEvent.setup();
		const initialHome = makeHomeData();
		const synchronization = deferred<Response>();
		let homeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					return homeRequestCount === 1
						? Promise.resolve(jsonResponse(initialHome))
						: synchronization.promise;
				}
				return Promise.resolve(
					jsonResponse(
						{
							code: "HABIT_ALREADY_COMPLETED_TODAY",
							message: "達成済みです。",
						},
						409,
					),
				);
			}),
		);
		const queryClient = createQueryClient();
		render(<HomeHabitList />, { wrapper: wrapper(queryClient) });
		await screen.findByText("1 / 3 完了");

		await user.click(screen.getByRole("button", { name: "読書を達成する" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"この習慣は本日すでに達成済みです",
		);
		await vi.waitFor(() => expect(homeRequestCount).toBe(2));
		const synchronizingButton = screen.getByRole("button", {
			name: "読書を最新状態を確認しています",
		});
		expect(synchronizingButton).toBeDisabled();
		expect(synchronizingButton).toHaveAttribute("aria-busy", "true");
		await user.click(synchronizingButton);
		expect(
			fetchMock.mock.calls.filter(
				([path]) => path === "/api/habits/reading/complete",
			),
		).toHaveLength(1);
		synchronization.resolve(
			jsonResponse({
				...initialHome,
				habits: [
					{ ...initialHome.habits[0], isCompletedToday: true },
					initialHome.habits[1],
				],
			}),
		);

		await vi.waitFor(() =>
			expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", { name: "読書を達成済み" }),
		).toBeDisabled();
	});

	it("StrictModeのeffect再setup後も成功したstale-state再同期でerrorを消去する", async () => {
		const user = userEvent.setup();
		const initialHome = makeHomeData();
		const synchronization = deferred<Response>();
		let homeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					return homeRequestCount === 1
						? Promise.resolve(jsonResponse(initialHome))
						: synchronization.promise;
				}
				return Promise.resolve(
					jsonResponse(
						{
							code: "HABIT_ALREADY_COMPLETED_TODAY",
							message: "達成済みです。",
						},
						409,
					),
				);
			}),
		);
		const queryClient = createQueryClient();
		render(<HomeHabitList />, { wrapper: strictWrapper(queryClient) });
		await screen.findByText("1 / 3 完了");

		await user.click(screen.getByRole("button", { name: "読書を達成する" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"この習慣は本日すでに達成済みです",
		);
		await vi.waitFor(() => expect(homeRequestCount).toBe(2));
		synchronization.resolve(
			jsonResponse({
				...initialHome,
				habits: [
					{ ...initialHome.habits[0], isCompletedToday: true },
					...initialHome.habits.slice(1),
				],
			}),
		);

		await vi.waitFor(() =>
			expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", { name: "読書を達成済み" }),
		).toBeDisabled();
	});

	it("stale-state 再同期GETが失敗するとalertを維持し、再試行を許可する", async () => {
		const user = userEvent.setup();
		const initialHome = makeHomeData();
		const synchronization = deferred<Response>();
		let homeRequestCount = 0;
		let completeRequestCount = 0;
		vi.stubGlobal(
			"fetch",
			fetchMock.mockImplementation((path: string) => {
				if (path === "/api/home") {
					homeRequestCount += 1;
					return homeRequestCount === 1
						? Promise.resolve(jsonResponse(initialHome))
						: synchronization.promise;
				}
				completeRequestCount += 1;
				return Promise.resolve(
					completeRequestCount === 1
						? jsonResponse(
								{
									code: "HABIT_ALREADY_COMPLETED_TODAY",
									message: "達成済みです。",
								},
								409,
							)
						: jsonResponse(completeResponse("reading")),
				);
			}),
		);
		const queryClient = createQueryClient();
		render(<HomeHabitList />, { wrapper: wrapper(queryClient) });
		await screen.findByText("1 / 3 完了");

		await user.click(screen.getByRole("button", { name: "読書を達成する" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"この習慣は本日すでに達成済みです",
		);
		await vi.waitFor(() => expect(homeRequestCount).toBe(2));
		expect(
			screen.getByRole("button", {
				name: "読書を最新状態を確認しています",
			}),
		).toBeDisabled();

		synchronization.resolve(jsonResponse({ message: "failed" }, 400));
		const retryButton = await screen.findByRole("button", {
			name: "読書を達成する",
		});
		expect(retryButton).toBeEnabled();
		expect(retryButton).not.toHaveAttribute("aria-busy");
		expect(screen.getByRole("alert")).toHaveTextContent(
			"この習慣は本日すでに達成済みです",
		);

		await user.click(retryButton);
		expect(
			fetchMock.mock.calls.filter(
				([path]) => path === "/api/habits/reading/complete",
			),
		).toHaveLength(2);
	});
});

function HomeHabitList() {
	const queryClient = useQueryClient();
	const home = useQuery(homeQueryOptions({ enabled: true }, queryClient));
	if (!home.data) {
		return <p>読み込み中…</p>;
	}
	return (
		<>
			<TodaySummary habits={home.data.habits} />
			<HabitList habits={home.data.habits} />
		</>
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

function strictWrapper(queryClient: QueryClient) {
	return function StrictQueryWrapper({ children }: PropsWithChildren) {
		return (
			<StrictMode>
				<QueryClientProvider client={queryClient}>
					{children}
				</QueryClientProvider>
			</StrictMode>
		);
	};
}

function createQueryClient(): QueryClient {
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

function makeHomeData(): HomeDataResponse {
	return {
		habits: [
			makeHabit({ isCompletedToday: false }),
			makeHabit({
				id: "exercise",
				name: "運動",
				emoji: "🏃",
				isCompletedToday: false,
			}),
			makeHabit({
				id: "walk",
				name: "散歩",
				emoji: "🚶",
				isCompletedToday: true,
			}),
		],
		activityLog: [{ date: "2026-08-08", completionRate: null }],
	};
}

function completeResponse(id: string) {
	return {
		dailyRecord: {
			id: "record-1",
			habitId: id,
			date: "2026-08-08",
			completedAt: "2026-08-08T12:00:00+09:00",
		},
		habit: {
			id,
			name: "読書",
			emoji: "📚",
			currentStreak: 4,
			maxStreak: 14,
			isCompletedToday: true,
		},
	};
}

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
