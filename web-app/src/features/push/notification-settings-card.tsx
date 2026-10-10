import { useEffect, useState } from "react";
import { isApiClientError } from "~/lib/api/client";
import type { NotificationSettingsResponse } from "./push-notifications.api-contract";
import {
	getNotificationSettings,
	isPushSupported,
	registerPushSubscription,
	serializePushSubscription,
	unregisterPushSubscription,
	updateNotificationSettings,
	urlBase64ToUint8Array,
	releaseCurrentDevicePushSubscription,
} from "./push-notifications.browser";

type NotificationSettingsCardProps = {
	onUnauthorized: () => void | Promise<void>;
};

type LocalStatus = "loading" | "ready" | "unsupported";

async function getCurrentSubscription(): Promise<PushSubscription | null> {
	const registration = await navigator.serviceWorker.ready;
	return registration.pushManager.getSubscription();
}

async function subscribeCurrentDevice(
	vapidPublicKey: string,
): Promise<{ subscription: PushSubscription; created: boolean }> {
	const permission = await Notification.requestPermission();
	if (permission !== "granted") {
		throw new DOMException(
			"Notification permission was not granted",
			"NotAllowedError",
		);
	}

	const registration = await navigator.serviceWorker.ready;
	const existing = await registration.pushManager.getSubscription();
	if (existing) {
		return { subscription: existing, created: false };
	}

	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
	});
	return { subscription, created: true };
}

function permissionMessage(): string | null {
	if (!isPushSupported()) {
		return null;
	}
	if (Notification.permission === "denied") {
		return "通知がブラウザで拒否されています。ブラウザまたはOSのサイト設定から通知を許可してください。";
	}
	return null;
}

export function NotificationSettingsCard({
	onUnauthorized,
}: NotificationSettingsCardProps) {
	const [status, setStatus] = useState<LocalStatus>("loading");
	const [settings, setSettings] = useState<NotificationSettingsResponse | null>(
		null,
	);
	const [notifyAt, setNotifyAt] = useState("20:00");
	const [deviceSubscribed, setDeviceSubscribed] = useState(false);
	const [isBusy, setIsBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [needsRecovery, setNeedsRecovery] = useState(false);

	useEffect(() => {
		let active = true;

		async function load() {
			if (!isPushSupported()) {
				if (active) setStatus("unsupported");
				return;
			}

			try {
				const [nextSettings, subscription] = await Promise.all([
					getNotificationSettings(),
					getCurrentSubscription(),
				]);
				if (!active) return;
				setSettings(nextSettings);
				setNotifyAt(nextSettings.notifyAt);
				setDeviceSubscribed(subscription != null);
				setStatus("ready");
			} catch (cause) {
				if (!active) return;
				if (isApiClientError(cause) && cause.status === 401) {
					await onUnauthorized();
					return;
				}
				setError("通知設定を読み込めませんでした。もう一度お試しください。");
				setStatus("ready");
			}
		}

		void load();
		return () => {
			active = false;
		};
	}, [onUnauthorized]);

	async function handleSubscribe(enableReminder: boolean, resetExisting = false) {
		if (!settings?.vapidPublicKey || isBusy) return;
		setIsBusy(true);
		setError(null);
		setMessage(null);
		let createdSubscription: PushSubscription | null = null;

		try {
			if (resetExisting) {
				// A prior account may own the existing endpoint. Revoking the
				// browser subscription forces a fresh endpoint without moving ownership.
				const oldSubscription = await getCurrentSubscription();
				if (oldSubscription && !(await oldSubscription.unsubscribe())) {
					throw new Error("Could not revoke existing push subscription");
				}
				setDeviceSubscribed(false);
			}
			const { subscription, created } = await subscribeCurrentDevice(
				settings.vapidPublicKey,
			);
			if (created) createdSubscription = subscription;
			await registerPushSubscription(serializePushSubscription(subscription));

			let nextSettings = settings;
			if (enableReminder && !settings.enabled) {
				nextSettings = await updateNotificationSettings({ enabled: true });
			}
			setSettings(nextSettings);
			setNotifyAt(nextSettings.notifyAt);
			setDeviceSubscribed(true);
			setNeedsRecovery(false);
			setMessage(
				enableReminder
					? "リマインダーをオンにしました。"
					: "この端末でも通知を受け取れるようにしました。",
			);
		} catch (cause) {
			if (createdSubscription) {
				await createdSubscription.unsubscribe().catch(() => false);
				setDeviceSubscribed(false);
			}
			if (cause instanceof DOMException && cause.name === "NotAllowedError") {
				setError(
					"通知が許可されませんでした。ブラウザまたはOSのサイト設定をご確認ください。",
				);
			} else if (isApiClientError(cause) && cause.status === 401) {
				await onUnauthorized();
			} else if (isApiClientError(cause) && cause.code === "PUSH_SUBSCRIPTION_CONFLICT") {
				setNeedsRecovery(true);
				setError("別アカウントがこの端末の通知登録を利用しています。下のボタンから購読を作り直せます。");
			} else if (isApiClientError(cause) && (
				cause.code === "PUSH_SUBSCRIPTION_LIMIT_EXCEEDED" ||
				cause.code === "PUSH_REGISTRATION_RATE_LIMITED" ||
				cause.code === "PUSH_ENDPOINT_NOT_ALLOWED"
			)) {
				setError(cause.message);
			} else {
				setError("通知を有効にできませんでした。もう一度お試しください。");
			}
		} finally {
			setIsBusy(false);
		}
	}

	async function handleDisable() {
		if (!settings || isBusy) return;
		setIsBusy(true);
		setError(null);
		setMessage(null);

		try {
			const nextSettings = await updateNotificationSettings({ enabled: false });
			setSettings(nextSettings);
			setNotifyAt(nextSettings.notifyAt);

			try {
				await releaseCurrentDevicePushSubscription();
				setDeviceSubscribed(false);
				setNeedsRecovery(false);
				setMessage("リマインダーをオフにしました。");
			} catch {
				setMessage(
					"リマインダーはオフです。端末の通知解除に失敗した可能性があります。再度通知設定をご確認ください。",
				);
			}
		} catch (cause) {
			if (isApiClientError(cause) && cause.status === 401) {
				await onUnauthorized();
			} else {
				setError(
					"リマインダーをオフにできませんでした。もう一度お試しください。",
				);
			}
		} finally {
			setIsBusy(false);
		}
	}

	async function handleSaveTime() {
		if (!settings || isBusy || notifyAt === settings.notifyAt) return;
		setIsBusy(true);
		setError(null);
		setMessage(null);
		try {
			const nextSettings = await updateNotificationSettings({ notifyAt });
			setSettings(nextSettings);
			setNotifyAt(nextSettings.notifyAt);
			setMessage("通知時刻を更新しました。");
		} catch (cause) {
			if (isApiClientError(cause) && cause.status === 401) {
				await onUnauthorized();
			} else {
				setError("通知時刻を更新できませんでした。もう一度お試しください。");
			}
		} finally {
			setIsBusy(false);
		}
	}

	if (status === "loading") {
		return (
			<section
				aria-labelledby="notification-settings-heading"
				className="mt-10 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
			>
				<h2
					className="text-lg font-semibold text-stone-950"
					id="notification-settings-heading"
				>
					リマインダー
				</h2>
				<p aria-live="polite" className="mt-2 text-sm text-stone-600">
					通知設定を読み込んでいます…
				</p>
			</section>
		);
	}

	if (status === "unsupported") {
		return (
			<section
				aria-labelledby="notification-settings-heading"
				className="mt-10 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
			>
				<h2
					className="text-lg font-semibold text-stone-950"
					id="notification-settings-heading"
				>
					リマインダー
				</h2>
				<p className="mt-2 text-sm leading-6 text-stone-600">
					この環境ではWeb Push通知を利用できません。iPhone / iPadではDaily
					Greenをホーム画面に追加したWebアプリからお試しください。
				</p>
			</section>
		);
	}

	const permissionHint = permissionMessage();
	const isConfigured = settings?.vapidPublicKey != null;

	return (
		<section
			aria-labelledby="notification-settings-heading"
			className="mt-10 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
		>
			<div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
				<div className="max-w-2xl">
					<h2
						className="text-lg font-semibold text-stone-950"
						id="notification-settings-heading"
					>
						リマインダー
					</h2>
					<p className="mt-1 text-sm leading-6 text-stone-600">
						設定した時刻に未達成の習慣が残っている場合だけ通知します。時刻はJSTです。
					</p>
					<p className="mt-2 text-sm font-medium text-stone-800">
						{settings?.enabled ? "リマインダー: オン" : "リマインダー: オフ"}
						{settings?.enabled
							? deviceSubscribed
								? " / この端末: ブラウザ購読あり"
								: " / この端末: 未登録"
							: ""}
					</p>
				</div>

				<div className="flex w-full max-w-sm flex-col gap-3">
					<label
						className="text-sm font-medium text-stone-800"
						htmlFor="notification-time"
					>
						通知時刻
					</label>
					<div className="flex gap-2">
						<input
							className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:bg-stone-100"
							disabled={isBusy || settings == null}
							id="notification-time"
							onChange={(event) => setNotifyAt(event.target.value)}
							step={60}
							type="time"
							value={notifyAt}
						/>
						<button
							className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
							disabled={
								isBusy || settings == null || notifyAt === settings.notifyAt
							}
							onClick={() => void handleSaveTime()}
							type="button"
						>
							保存
						</button>
					</div>

					{settings?.enabled ? (
						deviceSubscribed ? (
							<div className="flex flex-col gap-2">
								<button
									className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
									disabled={isBusy}
									onClick={() => void handleDisable()}
									type="button"
								>
									リマインダーをオフにする
								</button>
								<button
									className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
									disabled={isBusy}
									onClick={() => void handleSubscribe(false)}
									type="button"
								>
									この端末の登録を確認・更新する
								</button>
							</div>
						) : (
							<button
								className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={isBusy || !isConfigured}
								onClick={() => void handleSubscribe(false)}
								type="button"
							>
								この端末でも通知を受け取る
							</button>
						)
					) : (
						<button
							className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
							disabled={isBusy || !isConfigured || settings == null}
							onClick={() => void handleSubscribe(true)}
							type="button"
						>
							リマインダーをオンにする
						</button>
					)}
				</div>
			</div>

			{!isConfigured ? (
				<p className="mt-4 text-sm text-amber-800" role="status">
					通知機能はまだサーバー側で有効化されていません。
				</p>
			) : null}
			{permissionHint ? (
				<p className="mt-4 text-sm text-amber-800" role="status">
					{permissionHint}
				</p>
			) : null}
			{needsRecovery && settings?.vapidPublicKey ? (
				<div className="mt-4">
					<p className="text-sm text-stone-700">
						旧アカウントにログインできなくても、ブラウザの購読を無効にして新しく登録できます。
						旧アカウント側の記録は所有権を移さず、無効通知として後で整理されます。
					</p>
					<button
						className="mt-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 disabled:opacity-50"
						disabled={isBusy}
						onClick={() => void handleSubscribe(!settings.enabled, true)}
						type="button"
					>
						この端末の通知登録を作り直す
					</button>
				</div>
			) : null}
			{message ? (
				<p
					aria-live="polite"
					className="mt-4 text-sm text-emerald-800"
					role="status"
				>
					{message}
				</p>
			) : null}
			{error ? (
				<p
					aria-live="assertive"
					className="mt-4 text-sm text-red-700"
					role="alert"
				>
					{error}
				</p>
			) : null}
		</section>
	);
}
