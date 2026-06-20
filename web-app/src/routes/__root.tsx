import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
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

function RootErrorComponent({ error }: ErrorComponentProps) {
	const details =
		import.meta.env.DEV && error instanceof Error
			? error.message
			: "An unexpected error occurred.";
	const stack =
		import.meta.env.DEV && error instanceof Error ? error.stack : null;

	return (
		<RootDocument>
			<main className="container mx-auto p-4 pt-16">
				<h1>Error</h1>
				<p>{details}</p>
				{stack ? (
					<pre className="w-full overflow-x-auto p-4">
						<code>{stack}</code>
					</pre>
				) : null}
			</main>
		</RootDocument>
	);
}

function NotFoundComponent() {
	return (
		<RootDocument>
			<main className="container mx-auto p-4 pt-16">
				<h1>404</h1>
				<p>The requested page could not be found.</p>
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
