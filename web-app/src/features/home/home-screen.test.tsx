import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { homeQueryKey } from "./home.query";

const authMocks = vi.hoisted(() => ({
	oneTap: vi.fn(),
	refetchSession: vi.fn(),
	signOut: vi.fn(),
	useSession: vi.fn(),
}));

vi.mock("~/lib/auth-client", () => ({
	oneTap: authMocks.oneTap,
	signOut: authMocks.signOut,
	useSession: authMocks.useSession,
}));

import { HomeScreen } from "./home-screen";
import { LoginPanel } from "./login-panel";

const fetchMock = vi.fn();
let sessionState: ReturnType<typeof makeSessionState>;

beforeEach(() => {
	sessionState = makeSessionState();
	authMocks.useSession.mockImplementation(() => sessionState);
	authMocks.refetchSession.mockResolvedValue(undefined);
	authMocks.signOut.mockResolvedValue({ data: null, error: null });
	vi.stubGlobal("fetch", fetchMock.mockResolvedValue(jsonResponse(homeData())));
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("HomeScreen", () => {
	it("session確認中はホーム取得を始めず簡潔な読み込み表示を出す", () => {
		sessionState = makeSessionState({ isPending: true, data: null });
		renderHome();

		expect(screen.getByText("読み込み中…")).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("未認証では製品のログイン前表示だけを出してホームAPIを呼ばない", () => {
		sessionState = makeSessionState({ data: null });
		renderHome();

		expect(
			screen.getByRole("heading", { name: /毎日の積み上げを/ }),
		).toBeInTheDocument();
		expect(
			screen.getByText("毎日の習慣を記録して、積み上げを振り返りましょう。"),
		).toBeInTheDocument();
		expect(
			screen.queryByText(/動作確認用|DB サーバー/),
		).not.toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("session取得失敗時は内部情報を出さず一般的なログインエラーを表示する", () => {
		sessionState = makeSessionState({ data: null, error: new Error("secret") });
		renderHome();

		expect(screen.getByRole("alert")).toHaveTextContent(
			"ログインに失敗しました。もう一度お試しください。",
		);
		expect(screen.queryByText("secret")).not.toBeInTheDocument();
	});

	it("Google One Tap成功後はhard reloadせずreactive sessionを再取得する", async () => {
		const onSessionRefresh = vi.fn().mockResolvedValue(undefined);
		let onSuccess: (() => void) | undefined;
		authMocks.oneTap.mockImplementationOnce((options) => {
			onSuccess = options.fetchOptions?.onSuccess;
			return Promise.resolve();
		});
		render(
			<LoginPanel
				googleClientId="test-client-id"
				onSessionRefresh={onSessionRefresh}
			/>,
		);

		await vi.waitFor(() => expect(authMocks.oneTap).toHaveBeenCalledTimes(1));
		await act(async () => {
			onSuccess?.();
		});
		expect(onSessionRefresh).toHaveBeenCalledTimes(1);
	});

	it("認証済みでデータ取得中はHeaderを保ったままホームの読み込み表示を出す", async () => {
		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);
		renderHome();

		expect(
			await screen.findByText("今日の習慣を読み込んでいます…"),
		).toBeInTheDocument();
		expect(screen.getByText("太郎")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "ログアウト" })).toBeEnabled();
		pending.resolve(jsonResponse(homeData()));
	});

	it("Activity Log・今日の習慣・追加Dialog・達成操作を一つのホームに統合する", async () => {
		const user = userEvent.setup();
		fetchMock.mockResolvedValueOnce(jsonResponse(homeData()));
		renderHome();

		expect(
			await screen.findByRole("heading", { name: "アクティビティログ" }),
		).toBeInTheDocument();
		expect(screen.getByText("1 / 2 完了")).toBeInTheDocument();
		expect(screen.getByText("読書")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "読書を達成する" }),
		).toBeInTheDocument();
		expect(
			screen.getAllByRole("button", { name: "+ タスク追加" }),
		).toHaveLength(1);
		const todayHeading = screen.getByRole("heading", { name: "今日の習慣" });
		const addHabitButton = screen.getByRole("button", { name: "+ タスク追加" });
		const todaySectionHeader = todayHeading.parentElement?.parentElement;
		expect(todaySectionHeader).toHaveClass(
			"flex-col",
			"items-start",
			"sm:flex-row",
			"sm:items-center",
			"sm:justify-between",
		);
		expect(
			todayHeading.compareDocumentPosition(addHabitButton) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).not.toBe(0);
		expect(screen.queryByText("taro@example.com")).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "読書 の操作メニュー" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "編集" }));
		expect(
			await screen.findByRole("dialog", { name: "習慣を編集" }),
		).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await user.click(
			screen.getByRole("button", { name: "読書 の操作メニュー" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "アーカイブ" }));
		expect(
			await screen.findByRole("dialog", {
				name: "「読書」をアーカイブしますか？",
			}),
		).toBeInTheDocument();
		await user.keyboard("{Escape}");

		await user.click(screen.getByRole("button", { name: "+ タスク追加" }));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "習慣を追加" }),
		).toBeInTheDocument();
	});

	it("習慣が0件ならsummaryを省略し、追加CTAは見出し側の1つだけにする", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(homeData({ habits: [] })));
		renderHome();

		expect(
			await screen.findByText("今日の習慣はまだありません。"),
		).toBeInTheDocument();
		expect(screen.queryByText("0 / 0 完了")).not.toBeInTheDocument();
		expect(
			screen.getAllByRole("button", { name: "+ タスク追加" }),
		).toHaveLength(1);
	});

	it("初期取得エラーでは再読み込み導線を表示し、成功後はホームを表示する", async () => {
		const user = userEvent.setup();
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse(
					{ code: "INVALID_REQUEST", message: "API internal wording" },
					400,
				),
			)
			.mockResolvedValueOnce(jsonResponse(homeData()));
		renderHome();

		expect(
			await screen.findByRole("heading", {
				name: "データの取得に失敗しました。",
			}),
		).toBeInTheDocument();
		expect(screen.queryByText("API internal wording")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "再読み込み" }));
		expect(await screen.findByText("読書")).toBeInTheDocument();
	});

	it("background再取得エラーでも表示中のデータを維持して再試行できる", async () => {
		const user = userEvent.setup();
		fetchMock
			.mockResolvedValueOnce(jsonResponse(homeData()))
			.mockResolvedValueOnce(
				jsonResponse(
					{ code: "INVALID_REQUEST", message: "API internal wording" },
					400,
				),
			)
			.mockResolvedValueOnce(jsonResponse(homeData({ habits: [] })));
		const { queryClient } = renderHome();
		await screen.findByText("読書");

		await act(async () => {
			await queryClient.invalidateQueries({ queryKey: homeQueryKey });
		});

		expect(await screen.findByRole("status")).toHaveTextContent(
			"最新データの取得に失敗しました。",
		);
		expect(screen.getByText("読書")).toBeInTheDocument();
		expect(screen.queryByText("API internal wording")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "再読み込み" }));
		expect(
			await screen.findByText("今日の習慣はまだありません。"),
		).toBeInTheDocument();
	});

	it("401を受けたらhome cacheを破棄してsessionを再確認し、未認証表示へ戻す", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(
				{ code: "UNAUTHORIZED", message: "API internal wording" },
				401,
			),
		);
		const { queryClient, rerender } = renderHome();
		authMocks.refetchSession.mockImplementationOnce(async () => {
			sessionState = makeSessionState({ data: null });
			rerender(<HomeScreen />);
		});

		expect(
			await screen.findByRole("heading", { name: /毎日の積み上げを/ }),
		).toBeInTheDocument();
		expect(authMocks.refetchSession).toHaveBeenCalledTimes(1);
		await vi.waitFor(() =>
			expect(queryClient.getQueryData(homeQueryKey)).toBeUndefined(),
		);
	});

	it("ユーザー切替中は前ユーザーのhomeを表示せず、新しい取得が終わるまで待機する", async () => {
		const nextHome = deferred<Response>();
		fetchMock
			.mockResolvedValueOnce(jsonResponse(homeData()))
			.mockReturnValueOnce(nextHome.promise);
		const { rerender } = renderHome();
		await screen.findByText("読書");
		sessionState = makeSessionState({
			data: {
				session: { id: "session-2", userId: "user-2" },
				user: {
					id: "user-2",
					name: "花子",
					email: "hanako@example.com",
					image: null,
				},
			},
		});
		rerender(<HomeScreen />);

		expect(screen.queryByText("読書")).not.toBeInTheDocument();
		expect(
			screen.getByText("今日の習慣を読み込んでいます…"),
		).toBeInTheDocument();
		expect(screen.getByText("花子")).toBeInTheDocument();
		nextHome.resolve(jsonResponse(homeData({ habits: [] })));
		await screen.findByText("今日の習慣はまだありません。");
	});

	it("logout中は二重送信を防ぎ、成功時にcacheを破棄してreactive sessionを再確認する", async () => {
		const user = userEvent.setup();
		const logout = deferred<{ data: null; error: null }>();
		authMocks.signOut.mockReturnValueOnce(logout.promise);
		fetchMock.mockResolvedValueOnce(jsonResponse(homeData()));
		const { queryClient, rerender } = renderHome();
		await screen.findByText("読書");
		const previousHome = queryClient.getQueryData(homeQueryKey);
		expect(previousHome).toBeDefined();
		authMocks.refetchSession.mockImplementationOnce(async () => {
			sessionState = makeSessionState({ data: null });
			rerender(<HomeScreen />);
		});

		const button = screen.getByRole("button", { name: "ログアウト" });
		await user.dblClick(button);
		expect(authMocks.signOut).toHaveBeenCalledTimes(1);
		expect(button).toBeDisabled();
		expect(button).toHaveTextContent("ログアウトしています…");

		await act(async () => {
			logout.resolve({ data: null, error: null });
		});
		expect(
			await screen.findByRole("heading", { name: /毎日の積み上げを/ }),
		).toBeInTheDocument();
		expect(authMocks.refetchSession).toHaveBeenCalledTimes(1);
		await vi.waitFor(() =>
			expect(queryClient.getQueryData(homeQueryKey)).toBeUndefined(),
		);
	});

	it("logout失敗時は一般エラーを表示し、sessionとhome cacheを維持して再試行できる", async () => {
		const user = userEvent.setup();
		authMocks.signOut.mockResolvedValueOnce({
			data: null,
			error: new Error("internal logout detail"),
		});
		const { queryClient } = renderHome();
		await screen.findByText("読書");

		await user.click(screen.getByRole("button", { name: "ログアウト" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"ログアウトに失敗しました。もう一度お試しください。",
		);
		expect(
			screen.queryByText("internal logout detail"),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "ログアウト" })).toBeEnabled();
		expect(screen.getByText("読書")).toBeInTheDocument();
		expect(queryClient.getQueryData(homeQueryKey)).toBeDefined();
		expect(authMocks.refetchSession).not.toHaveBeenCalled();
	});
});

function renderHome() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});
	const result = render(<HomeScreen />, { wrapper: wrapper(queryClient) });
	return { ...result, queryClient };
}

function wrapper(queryClient: QueryClient) {
	return function QueryWrapper({ children }: PropsWithChildren) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	};
}

function makeSessionState(
	overrides: Partial<{
		data: {
			session: { id: string; userId: string };
			user: {
				id: string;
				name: string;
				email: string;
				image: string | null;
			};
		} | null;
		error: Error | null;
		isPending: boolean;
	}> = {},
) {
	return {
		data: {
			session: { id: "session-1", userId: "user-1" },
			user: {
				id: "user-1",
				name: "太郎",
				email: "taro@example.com",
				image: "https://example.com/avatar.png",
			},
		},
		error: null,
		isPending: false,
		isRefetching: false,
		refetch: authMocks.refetchSession,
		...overrides,
	};
}

function homeData(
	overrides: Partial<{
		habits: Array<{
			id: string;
			name: string;
			emoji: string;
			currentStreak: number;
			maxStreak: number;
			isCompletedToday: boolean;
		}>;
	}> = {},
) {
	return {
		habits: [
			{
				id: "reading",
				name: "読書",
				emoji: "📚",
				currentStreak: 2,
				maxStreak: 5,
				isCompletedToday: false,
			},
			{
				id: "walk",
				name: "散歩",
				emoji: "",
				currentStreak: 4,
				maxStreak: 4,
				isCompletedToday: true,
			},
		],
		activityLog: [
			{ date: "2026-08-07", completionRate: 0.5 },
			{ date: "2026-08-08", completionRate: null },
		],
		...overrides,
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}
