import { useEffect } from "react";

/** Push通知の前提となるService Workerを安全に登録する。UIは持たない。 */
export function ServiceWorkerRegistration() {
	useEffect(() => {
		if (
			typeof window === "undefined" ||
			!window.isSecureContext ||
			!("serviceWorker" in navigator)
		) {
			return;
		}

		void navigator.serviceWorker
			.register("/sw.js", { scope: "/" })
			.catch(() => {
				// Pushは補助機能のため、登録失敗をアプリ本体の障害へ波及させない。
			});
	}, []);

	return null;
}
