import type { KeyboardEvent } from "react";

const HABIT_EMOJI_OPTIONS = [
	{ emoji: "🌱", label: "新しい習慣" },
	{ emoji: "📚", label: "読書" },
	{ emoji: "📖", label: "本を読む" },
	{ emoji: "✍️", label: "書く" },
	{ emoji: "📝", label: "記録する" },
	{ emoji: "💻", label: "学習・作業" },
	{ emoji: "🎯", label: "目標" },
	{ emoji: "🧠", label: "勉強" },
	{ emoji: "🎓", label: "学習" },
	{ emoji: "💪", label: "筋トレ" },
	{ emoji: "🏋️", label: "ウェイトトレーニング" },
	{ emoji: "🏃", label: "ランニング" },
	{ emoji: "🚶", label: "散歩" },
	{ emoji: "🚴", label: "サイクリング" },
	{ emoji: "🏊", label: "水泳" },
	{ emoji: "🧘", label: "ヨガ・瞑想" },
	{ emoji: "🧘‍♀️", label: "ヨガ・瞑想（女性）" },
	{ emoji: "💧", label: "水分補給" },
	{ emoji: "🥗", label: "健康的な食事" },
	{ emoji: "🍎", label: "食事" },
	{ emoji: "☕", label: "コーヒー・休憩" },
	{ emoji: "🛌", label: "睡眠" },
	{ emoji: "🌙", label: "早寝" },
	{ emoji: "☀️", label: "早起き" },
	{ emoji: "🧹", label: "掃除" },
	{ emoji: "🧼", label: "衛生" },
	{ emoji: "🪥", label: "歯磨き" },
	{ emoji: "🎵", label: "音楽" },
	{ emoji: "🎨", label: "創作" },
	{ emoji: "💰", label: "貯金" },
	{ emoji: "🙏", label: "感謝" },
	{ emoji: "👍🏽", label: "いい習慣" },
] as const;

type EmojiPickerProps = {
	id: string;
	value: string;
	onChange: (emoji: string) => void;
	disabled?: boolean;
	error?: string;
};

export function EmojiPicker({
	id,
	value,
	onChange,
	disabled = false,
	error,
}: EmojiPickerProps) {
	const errorId = `${id}-error`;
	const inputId = `${id}-custom`;

	const focusOption = (index: number) => {
		document.getElementById(`${id}-option-${index}`)?.focus();
	};

	const handleOptionKeyDown = (
		event: KeyboardEvent<HTMLInputElement>,
		index: number,
	) => {
		const columns =
			typeof window.matchMedia === "function" &&
			window.matchMedia("(min-width: 640px)").matches
				? 8
				: 6;
		const column = index % columns;
		let nextIndex = index;

		switch (event.key) {
			case "ArrowLeft":
				if (column > 0) nextIndex = index - 1;
				break;
			case "ArrowRight":
				if (column < columns - 1 && index + 1 < HABIT_EMOJI_OPTIONS.length) {
					nextIndex = index + 1;
				}
				break;
			case "ArrowUp":
				if (index - columns >= 0) nextIndex = index - columns;
				break;
			case "ArrowDown":
				if (index + columns < HABIT_EMOJI_OPTIONS.length) {
					nextIndex = index + columns;
				}
				break;
			default:
				return;
		}

		event.preventDefault();
		if (nextIndex === index) return;
		onChange(HABIT_EMOJI_OPTIONS[nextIndex].emoji);
		focusOption(nextIndex);
	};

	return (
		<fieldset
			aria-describedby={error ? errorId : undefined}
			aria-invalid={error ? true : undefined}
			className="min-w-0"
			disabled={disabled}
		>
			<legend className="text-sm font-medium text-stone-900">
				絵文字（任意）
			</legend>
			<div className="mt-1 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
				<span className="text-sm text-stone-600">選択中</span>
				<span className="text-xl" aria-live="polite">
					{value || <span className="text-sm text-stone-500">未設定</span>}
				</span>
			</div>

			<label
				className={`relative mt-2 flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700 ${
					value === ""
						? "border-emerald-700 bg-emerald-50 text-emerald-900"
						: "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
				} has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-stone-100 has-[:disabled]:text-stone-500`}
			>
				<input
					aria-label="絵文字を設定しない"
					checked={value === ""}
					className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
					name={id}
					onChange={() => onChange("")}
					type="radio"
					value=""
				/>
				絵文字なし
			</label>

			<div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-8">
				{HABIT_EMOJI_OPTIONS.map((option, index) => {
					const selected = value === option.emoji;
					return (
						<label
							className={`relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border text-2xl transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700 ${
								selected
									? "border-emerald-700 bg-emerald-50 shadow-sm"
									: "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50"
							} has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-stone-100`}
							key={option.emoji}
							title={option.label}
						>
							<input
								aria-label={`${option.label} ${option.emoji}`}
								checked={selected}
								className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
								id={`${id}-option-${index}`}
								name={id}
								onChange={() => onChange(option.emoji)}
								onKeyDown={(event) => handleOptionKeyDown(event, index)}
								type="radio"
								value={option.emoji}
							/>
							<span aria-hidden="true">{option.emoji}</span>
						</label>
					);
				})}
			</div>
			<p className="mt-2 text-xs text-stone-500">
				矢印キーは画面上の上下左右に合わせて候補を移動します。
			</p>

			<div className="mt-3">
				<label className="block text-sm font-medium text-stone-700" htmlFor={inputId}>
					絵文字を直接入力
				</label>
				<input
					autoComplete="off"
					className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-950 shadow-sm outline-none placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
					id={inputId}
					onChange={(event) => onChange(event.target.value)}
					placeholder="例: 📚"
					type="text"
					value={value}
				/>
			</div>

			{error ? (
				<p className="mt-1 text-sm text-red-700" id={errorId} role="alert">
					{error}
				</p>
			) : null}
		</fieldset>
	);
}
