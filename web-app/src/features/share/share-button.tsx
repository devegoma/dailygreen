import { useEffect, useState } from "react";
import type { HomeDataResponse } from "~/features/home/home.contract";
import { buildShareText, createShareCardBlob } from "./share-card";

type ShareStatus = "idle" | "preparing" | "ready" | "fallback";

function isShareCancelled(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

async function copyShareText(text: string): Promise<boolean> {
	if (!navigator.clipboard?.writeText) {
		return false;
	}
	await navigator.clipboard.writeText(text);
	return true;
}

export function ShareButton({ home }: { home: HomeDataResponse }) {
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [status, setStatus] = useState<ShareStatus>("preparing");
	const [message, setMessage] = useState("");

	useEffect(() => {
		let active = true;
		setStatus("preparing");
		setImageFile(null);

		void createShareCardBlob(home)
			.then((blob) => {
				if (!active) {
					return;
				}
				setImageFile(
					new File([blob], "daily-green-progress.png", { type: "image/png" }),
				);
				setStatus("ready");
			})
			.catch(() => {
				if (active) {
					setStatus("fallback");
				}
			});

		return () => {
			active = false;
		};
	}, [home]);

	async function handleShare() {
		const text = buildShareText(home);
		setMessage("");

		try {
			if (imageFile && typeof navigator.share === "function") {
				const data = { files: [imageFile], text, title: "Daily Green" };
				if (
					typeof navigator.canShare !== "function" ||
					navigator.canShare(data)
				) {
					await navigator.share(data);
					return;
				}
			}

			if (typeof navigator.share === "function") {
				await navigator.share({ text, title: "Daily Green" });
				return;
			}

			if (await copyShareText(text)) {
				setMessage("共有文をコピーしました");
				return;
			}

			setMessage("このブラウザでは共有に対応していません");
		} catch (error) {
			if (isShareCancelled(error)) {
				return;
			}
			setMessage("共有できませんでした。もう一度お試しください");
		}
	}

	return (
		<div className="flex flex-col items-end gap-1">
			<button
				className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60"
				disabled={status === "preparing"}
				onClick={() => void handleShare()}
				type="button"
			>
				{status === "preparing" ? "共有を準備中" : "進捗を共有"}
			</button>
			{message ? (
				<p aria-live="polite" className="text-xs text-stone-600" role="status">
					{message}
				</p>
			) : null}
		</div>
	);
}
