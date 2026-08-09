import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useRef, useState } from "react";
import { ApiClientError } from "~/lib/api/client";
import { validateHabitEmoji, validateHabitName } from "./habit-validation";
import { useCreateHabitMutation } from "./habits.mutations";

type FieldErrors = {
	name?: string;
	emoji?: string;
};

type AddHabitDialogProps = {
	onUnauthorized?: () => void | Promise<void>;
};

function getNameError(value: string): string | undefined {
	const result = validateHabitName(value);
	if (result.isValid) {
		return undefined;
	}
	return result.reason === "required"
		? "習慣名を入力してください"
		: "習慣名は50文字以内で入力してください";
}

function getEmojiError(value: string): string | undefined {
	const result = validateHabitEmoji(value);
	if (result.isValid) {
		return undefined;
	}
	return result.reason === "multiple"
		? "絵文字は1つだけ入力してください"
		: "絵文字を1つだけ入力してください";
}

export function getAddHabitErrorMessage(error: unknown): string | null {
	if (!(error instanceof ApiClientError)) {
		return "通信に失敗しました。接続を確認して再試行してください";
	}
	if (error.status === 401) {
		return null;
	}
	if (error.status === null) {
		return "通信に失敗しました。接続を確認して再試行してください";
	}
	switch (error.code) {
		case "INVALID_REQUEST":
			return error.message || "リクエスト内容が不正です。";
		case "HABIT_LIMIT_EXCEEDED":
			return "これ以上、習慣を作成できません";
		case "INTERNAL_SERVER_ERROR":
			return "処理に失敗しました。時間をおいて再試行してください";
		default:
			return error.status >= 500
				? "処理に失敗しました。時間をおいて再試行してください"
				: "処理に失敗しました。時間をおいて再試行してください";
	}
}

export function AddHabitDialog({ onUnauthorized }: AddHabitDialogProps) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [emoji, setEmoji] = useState("");
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [submitError, setSubmitError] = useState<string | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const submitInFlight = useRef(false);
	const refetchHomeAfterClose = useRef(false);
	const mutation = useCreateHabitMutation({ onUnauthorized });
	const isPending = mutation.isPending;

	const resetForm = useCallback(() => {
		setName("");
		setEmoji("");
		setFieldErrors({});
		setSubmitError(null);
		mutation.reset();
	}, [mutation.reset]);

	const closeAndReset = useCallback(() => {
		if (isPending || submitInFlight.current) {
			return;
		}
		setOpen(false);
		resetForm();
	}, [isPending, resetForm]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			setOpen(true);
			return;
		}
		closeAndReset();
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isPending || submitInFlight.current) {
			return;
		}

		const nameError = getNameError(name);
		const emojiError = getEmojiError(emoji);
		if (nameError || emojiError) {
			setFieldErrors({ name: nameError, emoji: emojiError });
			setSubmitError(null);
			return;
		}

		const validatedName = validateHabitName(name);
		const validatedEmoji = validateHabitEmoji(emoji);
		if (!validatedName.isValid || !validatedEmoji.isValid) {
			return;
		}

		setFieldErrors({});
		setSubmitError(null);
		submitInFlight.current = true;
		try {
			await mutation.mutateAsync({
				name: validatedName.value,
				emoji: validatedEmoji.value,
			});
			refetchHomeAfterClose.current = true;
			setOpen(false);
			resetForm();
		} catch (error) {
			setSubmitError(getAddHabitErrorMessage(error));
		} finally {
			submitInFlight.current = false;
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog.Trigger asChild>
				<button
					className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-900"
					ref={triggerRef}
					type="button"
				>
					+ タスク追加
				</button>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 bg-stone-950/30" />
				<Dialog.Content
					aria-busy={isPending || undefined}
					className="fixed top-1/2 left-1/2 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none"
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						triggerRef.current?.focus();
						if (refetchHomeAfterClose.current) {
							refetchHomeAfterClose.current = false;
							void mutation.refetchHome();
						}
					}}
					onEscapeKeyDown={(event) => {
						if (isPending || submitInFlight.current) {
							event.preventDefault();
						}
					}}
					onInteractOutside={(event) => {
						if (isPending || submitInFlight.current) {
							event.preventDefault();
						}
					}}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						nameInputRef.current?.focus();
					}}
				>
					<Dialog.Title className="text-lg font-semibold text-stone-950">
						習慣を追加
					</Dialog.Title>
					<Dialog.Description className="mt-1 text-sm text-stone-600">
						毎日続けたい習慣を登録します。
					</Dialog.Description>
					<form className="mt-6 space-y-4" onSubmit={handleSubmit}>
						<div>
							<label
								className="block text-sm font-medium text-stone-900"
								htmlFor="add-habit-name"
							>
								習慣名
							</label>
							<input
								aria-describedby={
									fieldErrors.name ? "add-habit-name-error" : undefined
								}
								aria-invalid={fieldErrors.name ? true : undefined}
								className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-950 shadow-sm outline-none placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
								disabled={isPending}
								id="add-habit-name"
								onChange={(event) => {
									setName(event.target.value);
									setFieldErrors((current) => ({
										...current,
										name: undefined,
									}));
									setSubmitError(null);
								}}
								ref={nameInputRef}
								value={name}
							/>
							{fieldErrors.name ? (
								<p
									className="mt-1 text-sm text-red-700"
									id="add-habit-name-error"
									role="alert"
								>
									{fieldErrors.name}
								</p>
							) : null}
						</div>
						<div>
							<label
								className="block text-sm font-medium text-stone-900"
								htmlFor="add-habit-emoji"
							>
								絵文字（任意）
							</label>
							<input
								aria-describedby={
									fieldErrors.emoji ? "add-habit-emoji-error" : undefined
								}
								aria-invalid={fieldErrors.emoji ? true : undefined}
								className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-950 shadow-sm outline-none placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
								disabled={isPending}
								id="add-habit-emoji"
								onChange={(event) => {
									setEmoji(event.target.value);
									setFieldErrors((current) => ({
										...current,
										emoji: undefined,
									}));
									setSubmitError(null);
								}}
								placeholder="例: 📚"
								value={emoji}
							/>
							{fieldErrors.emoji ? (
								<p
									className="mt-1 text-sm text-red-700"
									id="add-habit-emoji-error"
									role="alert"
								>
									{fieldErrors.emoji}
								</p>
							) : null}
						</div>
						{submitError ? (
							<p className="text-sm text-red-700" role="alert">
								{submitError}
							</p>
						) : null}
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<button
								className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
								disabled={isPending}
								onClick={closeAndReset}
								type="button"
							>
								キャンセル
							</button>
							<button
								aria-busy={isPending || undefined}
								className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-900"
								disabled={isPending}
								type="submit"
							>
								{isPending ? "追加しています…" : "追加"}
							</button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
