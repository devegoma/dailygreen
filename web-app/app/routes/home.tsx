import { useEffect, useRef, useState } from "react";
import { oneTap, signOut, useSession } from "../lib/auth-client";
import type { Route } from "./+types/home";

export function meta(_meta: Route.MetaArgs) {
	return [
		{ title: "Daily Green" },
		{ name: "description", content: "習慣化アプリ" },
	];
}

export default function Home() {
	const { data: session, isPending } = useSession();
	const buttonRef = useRef<HTMLDivElement>(null);
	const [loginError, setLoginError] = useState<string | null>(null);

	useEffect(() => {
		if (isPending || session || !buttonRef.current) {
			return;
		}

		if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
			console.error("VITE_GOOGLE_CLIENT_ID is not set");
			return;
		}

		void oneTap({
			button: {
				container: buttonRef.current,
				config: {
					type: "standard",
					theme: "outline",
					size: "large",
					text: "signin_with",
					locale: "ja",
					width: 280,
				},
			},
			fetchOptions: {
				onSuccess: () => {
					window.location.reload();
				},
				onError: () => {
					setLoginError(
						"ログインに失敗しました。PostgreSQL が起動しているか確認してください。",
					);
				},
			},
		});
	}, [session, isPending]);

	const handleLogout = async () => {
		await signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.reload();
				},
			},
		});
	};

	return (
		<div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
			<h1>Daily Green 動作確認用ページ</h1>

			{isPending ? (
				<p>読み込み中...</p>
			) : session ? (
				<div
					style={{
						border: "1px solid #ccc",
						padding: "1rem",
						borderRadius: "8px",
						maxWidth: "400px",
					}}
				>
					<h2>ログイン成功 🎉</h2>
					{session.user.image ? (
						<img
							src={session.user.image}
							alt="User Icon"
							style={{ width: "50px", borderRadius: "50%" }}
						/>
					) : null}
					<p>
						<strong>名前:</strong> {session.user.name}
					</p>
					<p>
						<strong>メール:</strong> {session.user.email}
					</p>
					<button
						type="button"
						onClick={handleLogout}
						className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 hover:shadow active:scale-[0.98] active:bg-gray-100"
					>
						ログアウト
					</button>
				</div>
			) : (
				<div>
					<p className="mb-4 text-gray-600">ログインしていません</p>
					{loginError ? (
						<p className="mb-4 text-sm text-red-600">{loginError}</p>
					) : null}
					<div ref={buttonRef} />
				</div>
			)}
		</div>
	);
}
