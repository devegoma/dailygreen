type HomeHeaderProps = {
	isLoggingOut: boolean;
	logoutError: string | null;
	onLogout: () => void;
	user: {
		image?: string | null;
		name?: string | null;
	};
};

/** 認証済みホームのためだけの、最小限のアカウントヘッダー。 */
export function HomeHeader({
	isLoggingOut,
	logoutError,
	onLogout,
	user,
}: HomeHeaderProps) {
	return (
		<header className="border-b border-stone-200 bg-white">
			<div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
				<a
					className="rounded text-lg font-semibold tracking-tight text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
					href="#main-content"
				>
					Daily Green
				</a>
				<div className="flex min-w-0 items-center gap-3">
					{user.image ? (
						<img
							alt=""
							className="h-9 w-9 shrink-0 rounded-full border border-stone-200 bg-stone-100 object-cover"
							src={user.image}
						/>
					) : null}
					{user.name ? (
						<p className="truncate text-sm font-medium text-stone-700">
							{user.name}
						</p>
					) : null}
					<button
						aria-busy={isLoggingOut || undefined}
						className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
						disabled={isLoggingOut}
						onClick={onLogout}
						type="button"
					>
						{isLoggingOut ? "ログアウトしています…" : "ログアウト"}
					</button>
				</div>
			</div>
			{logoutError ? (
				<p
					className="mx-auto w-full max-w-6xl px-4 pb-3 text-sm text-red-700 sm:px-6 lg:px-8"
					role="alert"
				>
					{logoutError}
				</p>
			) : null}
		</header>
	);
}
