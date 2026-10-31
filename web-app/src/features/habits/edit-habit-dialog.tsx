import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { HomeHabit } from "~/features/home/home.contract";
import { EmojiPicker } from "./emoji-picker";
import { getEditHabitErrorMessage } from "./habit-dialog-errors";
import { validateHabitEmoji, validateHabitName } from "./habit-validation";
import {
	useIsHabitMutationPending,
	useIsHabitMutationSynchronizing,
	useUpdateHabitMutation,
} from "./habits.mutations";

type FieldErrors = { name?: string; emoji?: string };

type EditHabitDialogProps = {
	habit: HomeHabit;
	open: boolean;
	triggerRef: React.RefObject<HTMLButtonElement | null>;
	onOpenChange: (open: boolean) => void;
	onUnauthorized?: () => void | Promise<void>;
};

function getNameError(value: string): string | undefined {
	const result = validateHabitName(value);
	if (result.isValid) return undefined;
	return result.reason === "required"
		? "習慣名を入力してください"
		: "習慣名は50文字以内で入力してください";
}

function getEmojiError(value: string): string | undefined {
	const result = validateHabitEmoji(value);
	if (result.isValid) return undefined;
	return result.reason === "multiple"
		? "絵文字は1つだけ入力してください"
		: "絵文字を1つだけ入力してください";
}

export function EditHabitDialog({
	habit,
	open,
	triggerRef,
	onOpenChange,
	onUnauthorized,
}: EditHabitDialogProps) {
	const [name, setName] = useState(habit.name);
	const [emoji, setEmoji] = useState(habit.emoji);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [submitError, setSubmitError] = useState<string | null>(null);
	const wasOpenRef = useRef(false);
	const submitInFlight = useRef(false);
	const refetchHomeAfterClose = useRef(false);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const mountedRef = useRef(true);
	const mutation = useUpdateHabitMutation(habit.id, { onUnauthorized });
	const isAnyHabitMutationPending = useIsHabitMutationPending(habit.id);
	const isHabitSynchronizing = useIsHabitMutationSynchronizing(habit.id);
	const isPending = mutation.isPending || isAnyHabitMutationPending;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (open && !wasOpenRef.current) {
			setName(habit.name);
			setEmoji(habit.emoji);
			setFieldErrors({});
			setSubmitError(null);
			mutation.reset();
		}
		wasOpenRef.current = open;
	}, [habit.emoji, habit.name, mutation.reset, open]);

	useEffect(() => {
		if (mutation.isStaleStateSynchronized) {
			mutation.resetStaleStateError();
			setSubmitError(null);
		}
	}, [mutation.isStaleStateSynchronized, mutation.resetStaleStateError]);

	const resetToLatestValues = () => {
		setName(habit.name);
		setEmoji(habit.emoji);
		setFieldErrors({});
		setSubmitError(null);
		mutation.reset();
	};
	const requestClose = () => {
		if (isPending || isHabitSynchronizing || submitInFlight.current) return;
		onOpenChange(false);
		resetToLatestValues();
	};
	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isPending || isHabitSynchronizing || submitInFlight.current) return;

		const nameError = getNameError(name);
		const emojiError = getEmojiError(emoji);
		if (nameError || emojiError) {
			setFieldErrors({ name: nameError, emoji: emojiError });
			setSubmitError(null);
			return;
		}
		const validName = validateHabitName(name);
		const validEmoji = validateHabitEmoji(emoji);
		if (!validName.isValid || !validEmoji.isValid) return;

		setFieldErrors({});
		setSubmitError(null);
		submitInFlight.current = true;
		try {
			// name / emoji を常に送るため、絵文字を空文字にして未設定へ戻せる。
			await mutation.mutateAsync({
				name: validName.value,
				emoji: validEmoji.value,
			});
			if (mountedRef.current) {
				refetchHomeAfterClose.current = true;
				onOpenChange(false);
				resetToLatestValues();
			}
		} catch (error) {
			if (mountedRef.current) setSubmitError(getEditHabitErrorMessage(error));
		} finally {
			submitInFlight.current = false;
		}
	};

	const handleEmojiChange = (nextEmoji: string) => {
		setEmoji(nextEmoji);
		setFieldErrors((current) => ({ ...current, emoji: undefined }));
		setSubmitError(null);
	};

	const blocksClose =
		isPending || isHabitSynchronizing || submitInFlight.current;
	return (
		<Dialog.Root
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) requestClose();
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 bg-stone-950/30" />
				<Dialog.Content
					aria-busy={blocksClose || undefined}
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
						if (blocksClose) event.preventDefault();
					}}
					onInteractOutside={(event) => {
						if (blocksClose) event.preventDefault();
					}}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						nameInputRef.current?.focus();
					}}
				>
					<Dialog.Title className="text-lg font-semibold text-stone-950">
						習慣を編集
					</Dialog.Title>
					<Dialog.Description className="mt-1 text-sm text-stone-600">
						習慣名と絵文字を変更できます。
					</Dialog.Description>
					<form className="mt-6 space-y-4" onSubmit={handleSubmit}>
						<div>
							<label
								className="block text-sm font-medium text-stone-900"
								htmlFor={`edit-habit-name-${habit.id}`}
							>
								習慣名
							</label>
							<input
								aria-describedby={
									fieldErrors.name
										? `edit-habit-name-error-${habit.id}`
										: undefined
								}
								aria-invalid={fieldErrors.name ? true : undefined}
								className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-950 shadow-sm outline-none placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
								disabled={blocksClose}
								id={`edit-habit-name-${habit.id}`}
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
									id={`edit-habit-name-error-${habit.id}`}
									role="alert"
								>
									{fieldErrors.name}
								</p>
							) : null}
						</div>
						<EmojiPicker
							disabled={blocksClose}
							error={fieldErrors.emoji}
							id={`edit-habit-emoji-${habit.id}`}
							onChange={handleEmojiChange}
							value={emoji}
						/>
						{submitError ? (
							<p className="text-sm text-red-700" role="alert">
								{submitError}
							</p>
						) : null}
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<button
								className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
								disabled={blocksClose}
								onClick={requestClose}
								type="button"
							>
								キャンセル
							</button>
							<button
								aria-busy={blocksClose || undefined}
								className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-900"
								disabled={blocksClose}
								type="submit"
							>
								{mutation.isPending
									? "保存しています…"
									: isHabitSynchronizing
										? "状態を確認しています…"
										: "保存"}
							</button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
