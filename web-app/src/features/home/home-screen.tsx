import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { signOut, useSession } from "~/lib/auth-client";
import { useJstMidnightHomeRefresh } from "./home.day-change";
import { clearHomeCache, useHomeQuery } from "./home.query";
import { HomeHeader } from "./home-header";
import { HomeMainContent } from "./home-main-content";
import { LoginPanel } from "./login-panel";

function LoadingHome() {
	return (
		<main
			className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center justify-center px-4 sm:px-6 lg:px-8"
			id="main-content"
		>
			<p aria-live="polite" className="text-sm text-stone-600">
				今日の習慣を読み込んでいます…
			</p>
		</main>
	);
}

function InitialHomeError({ onRetry }: { onRetry: () => void }) {
	return (
		<main
			className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center justify-center px-4 sm:px-6 lg:px-8"
			id="main-content"
		>
			<section className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
				<h1 className="text-lg font-semibold text-stone-950">
					データの取得に失敗しました。
				</h1>
				<p className="mt-2 text-sm leading-6 text-stone-600">
					時間をおいて、もう一度お試しください。
				</p>
				<button
					className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
					onClick={onRetry}
					type="button"
				>
					再読み込み
				</button>
			</section>
		</main>
	);
}

/** session と home query を仲介し、各表示 component を接続する薄い画面コンテナ。 */
export function HomeScreen() {
	const queryClient = useQueryClient();
	const {
		data: session,
		error: sessionError,
		isPending: isSessionPending,
		refetch: refetchSession,
	} = useSession();
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [logoutError, setLogoutError] = useState<string | null>(null);
	const logoutInFlightRef = useRef(false);

	const refreshSession = useCallback(async () => {
		await refetchSession();
	}, [refetchSession]);
	const handleUnauthorized = useCallback(async () => {
		await refreshSession();
	}, [refreshSession]);
	const homeQuery = useHomeQuery({
		enabled: session != null,
		userId: session?.user.id,
		onUnauthorized: handleUnauthorized,
	});

	// client clock はタイマー予約だけに使い、データ上の「今日」は API を正とする。
	useJstMidnightHomeRefresh(queryClient, session != null);

	const handleLogout = useCallback(async () => {
		if (logoutInFlightRef.current) {
			return;
		}

		logoutInFlightRef.current = true;
		setIsLoggingOut(true);
		setLogoutError(null);
		try {
			const result = await signOut();
			if (result.error) {
				throw result.error;
			}
			await clearHomeCache(queryClient);
			await refreshSession();
		} catch {
			setLogoutError("ログアウトに失敗しました。もう一度お試しください。");
		} finally {
			logoutInFlightRef.current = false;
			setIsLoggingOut(false);
		}
	}, [queryClient, refreshSession]);

	if (isSessionPending) {
		return (
			<main className="flex min-h-dvh items-center justify-center p-4">
				<p aria-live="polite" className="text-sm text-stone-600">
					読み込み中…
				</p>
			</main>
		);
	}

	if (session == null) {
		return (
			<LoginPanel
				initialError={sessionError != null}
				onSessionRefresh={refreshSession}
			/>
		);
	}

	return (
		<div className="min-h-dvh bg-stone-50">
			<HomeHeader
				isLoggingOut={isLoggingOut}
				logoutError={logoutError}
				onLogout={() => {
					void handleLogout();
				}}
				user={session.user}
			/>
			{homeQuery.data ? (
				<HomeMainContent
					backgroundError={homeQuery.isError}
					home={homeQuery.data}
					onRetry={() => {
						void homeQuery.refetch();
					}}
					onUnauthorized={handleUnauthorized}
				/>
			) : homeQuery.isError ? (
				<InitialHomeError
					onRetry={() => {
						void homeQuery.refetch();
					}}
				/>
			) : (
				<LoadingHome />
			)}
		</div>
	);
}
