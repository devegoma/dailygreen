import { useEffect, useRef, useState } from "react";
import { oneTap } from "~/lib/auth-client";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

type LoginPanelProps = {
	googleClientId?: string;
	initialError?: boolean;
	onSessionRefresh: () => Promise<void>;
};

/** 未認証時だけに表示する、Google One Tap のログイン導線。 */
export function LoginPanel({
	googleClientId = GOOGLE_CLIENT_ID,
	initialError = false,
	onSessionRefresh,
}: LoginPanelProps) {
	const buttonRef = useRef<HTMLDivElement>(null);
	const initializedRef = useRef(false);
	const [loginError, setLoginError] = useState(
		initialError ? "ログインに失敗しました。もう一度お試しください。" : null,
	);

	useEffect(() => {
		if (initialError) {
			setLoginError("ログインに失敗しました。もう一度お試しください。");
		}
	}, [initialError]);

	useEffect(() => {
		if (initializedRef.current || !buttonRef.current) {
			return;
		}
		initializedRef.current = true;

		if (googleClientId === "") {
			setLoginError("ログインに失敗しました。もう一度お試しください。");
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
					void onSessionRefresh().catch(() => {
						setLoginError("ログインに失敗しました。もう一度お試しください。");
					});
				},
				onError: () => {
					setLoginError("ログインに失敗しました。もう一度お試しください。");
				},
			},
		}).catch(() => {
			setLoginError("ログインに失敗しました。もう一度お試しください。");
		});
	}, [googleClientId, onSessionRefresh]);

	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-4 py-12 sm:px-6">
			<section className="w-full rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
				<p className="text-sm font-semibold tracking-wide text-emerald-800">
					Daily Green
				</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
					毎日の積み上げを、
					<br className="sm:hidden" />
					続けやすく。
				</h1>
				<p className="mt-4 text-base leading-7 text-stone-600">
					毎日の習慣を記録して、積み上げを振り返りましょう。
				</p>
				<div className="mt-7 min-h-11" ref={buttonRef} />
				{loginError ? (
					<p className="mt-4 text-sm text-red-700" role="alert">
						{loginError}
					</p>
				) : null}
			</section>
		</main>
	);
}
