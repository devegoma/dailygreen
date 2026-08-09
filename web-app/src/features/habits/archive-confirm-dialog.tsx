import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { HomeHabit } from "~/features/home/home.contract";
import { getArchiveHabitErrorMessage } from "./habit-dialog-errors";
import {
	useArchiveHabitMutation,
	useIsHabitMutationPending,
	useIsHabitMutationSynchronizing,
} from "./habits.mutations";

type ArchiveConfirmDialogProps = {
	habit: HomeHabit;
	open: boolean;
	triggerRef: React.RefObject<HTMLButtonElement | null>;
	fallbackFocusRef?: React.RefObject<HTMLElement | null>;
	onOpenChange: (open: boolean) => void;
	onUnauthorized?: () => void | Promise<void>;
};

export function ArchiveConfirmDialog({
	habit,
	open,
	triggerRef,
	fallbackFocusRef,
	onOpenChange,
	onUnauthorized,
}: ArchiveConfirmDialogProps) {
	const [submitError, setSubmitError] = useState<string | null>(null);
	const submitInFlight = useRef(false);
	const refetchHomeAfterClose = useRef(false);
	const mountedRef = useRef(true);
	const wasOpenRef = useRef(false);
	const mutation = useArchiveHabitMutation(habit.id, { onUnauthorized });
	const isAnyHabitMutationPending = useIsHabitMutationPending(habit.id);
	const isHabitSynchronizing = useIsHabitMutationSynchronizing(habit.id);
	const isPending = mutation.isPending || isAnyHabitMutationPending;
	const shouldBlockInteraction = () =>
		isPending || isHabitSynchronizing || submitInFlight.current;
	const blocksClose = shouldBlockInteraction();

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);
	useEffect(() => {
		if (open && !wasOpenRef.current) {
			setSubmitError(null);
			mutation.reset();
		}
		wasOpenRef.current = open;
	}, [mutation.reset, open]);
	useEffect(() => {
		if (mutation.isStaleStateSynchronized) {
			mutation.resetStaleStateError();
			setSubmitError(null);
		}
	}, [mutation.isStaleStateSynchronized, mutation.resetStaleStateError]);

	const requestClose = () => {
		if (shouldBlockInteraction()) return;
		onOpenChange(false);
		setSubmitError(null);
		mutation.reset();
	};
	const archive = async () => {
		if (shouldBlockInteraction()) return;
		setSubmitError(null);
		submitInFlight.current = true;
		try {
			// 既アーカイブで返る冪等な 200 も通常の成功として閉じる。
			await mutation.mutateAsync();
			if (mountedRef.current) {
				refetchHomeAfterClose.current = true;
				onOpenChange(false);
				mutation.reset();
			}
		} catch (error) {
			if (mountedRef.current)
				setSubmitError(getArchiveHabitErrorMessage(error));
		} finally {
			submitInFlight.current = false;
		}
	};

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
							void mutation.refetchHome().then(() => {
								// Query observerの描画反映後、対象cardの消滅でfocusが失われた
								// 場合だけfallbackする。refetch中に移動したfocusは奪わない。
								setTimeout(() => {
									const activeElement = document.activeElement;
									const focusWasLost =
										activeElement === document.body ||
										!activeElement?.isConnected;
									if (!triggerRef.current?.isConnected && focusWasLost) {
										fallbackFocusRef?.current?.focus();
									}
								}, 0);
							});
						}
					}}
					onEscapeKeyDown={(event) => {
						if (shouldBlockInteraction()) event.preventDefault();
					}}
					onInteractOutside={(event) => {
						if (shouldBlockInteraction()) event.preventDefault();
					}}
				>
					<Dialog.Title className="text-lg font-semibold text-stone-950">
						「{habit.name}」をアーカイブしますか？
					</Dialog.Title>
					<Dialog.Description className="mt-3 space-y-1 text-sm text-stone-600">
						<span className="block">
							アーカイブした習慣は今日の習慣に表示されなくなります。
						</span>
						<span className="block">
							アーカイブ済み習慣の復元 UI はありません。
						</span>
					</Dialog.Description>
					{submitError ? (
						<p className="mt-4 text-sm text-red-700" role="alert">
							{submitError}
						</p>
					) : null}
					<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
							className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:bg-red-100 disabled:text-red-900"
							disabled={blocksClose}
							onClick={archive}
							type="button"
						>
							{mutation.isPending
								? "アーカイブしています…"
								: isHabitSynchronizing
									? "状態を確認しています…"
									: "アーカイブする"}
						</button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
