import { signIn, signOut, useSession } from "../lib/auth-client";
import type { Route } from "./+types/home";

export function meta(_meta: Route.MetaArgs) {
	return [
		{ title: "Daily Green" },
		{ name: "description", content: "習慣化アプリ" },
	];
}

export default function Home() {
	const { data: session, isPending } = useSession();

	const handleLogin = async () => {
		await signIn.social({
			provider: "google",
			callbackURL: "/",
		});
	};

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
					<img
						src={session.user.image ?? ""}
						alt="User Icon"
						style={{ width: "50px", borderRadius: "50%" }}
					/>
					<p>
						<strong>名前:</strong> {session.user.name}
					</p>
					<p>
						<strong>メール:</strong> {session.user.email}
					</p>
					<button
						type="button"
						onClick={handleLogout}
						style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
					>
						ログアウト
					</button>
				</div>
			) : (
				<div>
					<p>ログインしていません</p>
					<button
						type="button"
						onClick={handleLogin}
						style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
					>
						Googleでログイン
					</button>
				</div>
			)}
		</div>
	);
}
