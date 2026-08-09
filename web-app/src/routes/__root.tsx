import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "~/app.css?url";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
			},
		],
	}),
	errorComponent: RootErrorComponent,
	notFoundComponent: NotFoundComponent,
	component: RootComponent,
});

function RootComponent() {
	const { queryClient } = Route.useRouteContext();

	return (
		<QueryClientProvider client={queryClient}>
			<RootDocument>
				<Outlet />
			</RootDocument>
		</QueryClientProvider>
	);
}

function RootErrorComponent() {
	return (
		<RootDocument>
			<main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-4 py-12 sm:px-6">
				<section className="w-full rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
					<h1 className="text-lg font-semibold text-stone-950">
						ページを表示できませんでした
					</h1>
					<p className="mt-2 text-sm text-stone-600">
						時間をおいて、もう一度お試しください。
					</p>
					<a
						className="mt-5 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
						href="/"
					>
						ホームへ戻る
					</a>
				</section>
			</main>
		</RootDocument>
	);
}

function NotFoundComponent() {
	return (
		<RootDocument>
			<main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-4 py-12 sm:px-6">
				<section className="w-full rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
					<h1 className="text-lg font-semibold text-stone-950">
						ページが見つかりません
					</h1>
					<p className="mt-2 text-sm text-stone-600">
						URLをご確認のうえ、もう一度お試しください。
					</p>
					<a
						className="mt-5 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
						href="/"
					>
						ホームへ戻る
					</a>
				</section>
			</main>
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="ja">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
