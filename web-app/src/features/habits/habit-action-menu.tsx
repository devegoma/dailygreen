import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRef, useState } from "react";
import type { HomeHabit } from "~/features/home/home.contract";
import { ArchiveConfirmDialog } from "./archive-confirm-dialog";
import { EditHabitDialog } from "./edit-habit-dialog";
import {
	useIsHabitMutationPending,
	useIsHabitMutationSynchronizing,
} from "./habits.mutations";

type HabitActionMenuProps = {
	habit: HomeHabit;
	onUnauthorized?: () => void | Promise<void>;
};

export function HabitActionMenu({
	habit,
	onUnauthorized,
}: HabitActionMenuProps) {
	const [editOpen, setEditOpen] = useState(false);
	const [archiveOpen, setArchiveOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const isHabitMutationPending = useIsHabitMutationPending(habit.id);
	const isHabitSynchronizing = useIsHabitMutationSynchronizing(habit.id);
	const isDisabled = isHabitMutationPending || isHabitSynchronizing;

	return (
		<div className="self-start sm:self-auto">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					<button
						aria-busy={isHabitSynchronizing || undefined}
						aria-label={`${habit.name} の操作メニュー`}
						className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white text-lg leading-none text-stone-700 shadow-sm transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
						disabled={isDisabled}
						ref={triggerRef}
						type="button"
					>
						…
					</button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						align="end"
						className="z-50 min-w-32 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
						sideOffset={6}
					>
						<DropdownMenu.Item
							className="cursor-pointer rounded-md px-3 py-2 text-sm text-stone-800 outline-none data-[highlighted]:bg-emerald-50 data-[highlighted]:text-emerald-950 data-[disabled]:cursor-not-allowed data-[disabled]:text-stone-400"
							disabled={isDisabled}
							onSelect={(event) => {
								if (isDisabled) {
									event.preventDefault();
									return;
								}
								setEditOpen(true);
							}}
						>
							編集
						</DropdownMenu.Item>
						<DropdownMenu.Item
							className="cursor-pointer rounded-md px-3 py-2 text-sm text-red-700 outline-none data-[highlighted]:bg-red-50 data-[highlighted]:text-red-900 data-[disabled]:cursor-not-allowed data-[disabled]:text-stone-400"
							disabled={isDisabled}
							onSelect={(event) => {
								if (isDisabled) {
									event.preventDefault();
									return;
								}
								setArchiveOpen(true);
							}}
						>
							アーカイブ
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<EditHabitDialog
				habit={habit}
				onOpenChange={setEditOpen}
				onUnauthorized={onUnauthorized}
				open={editOpen}
				triggerRef={triggerRef}
			/>
			<ArchiveConfirmDialog
				habit={habit}
				onOpenChange={setArchiveOpen}
				onUnauthorized={onUnauthorized}
				open={archiveOpen}
				triggerRef={triggerRef}
			/>
		</div>
	);
}
