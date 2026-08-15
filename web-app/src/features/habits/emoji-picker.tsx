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
	const hasPresetValue = HABIT_EMOJI_OPTIONS.some(
		(option) => option.emoji === value,
	);
	const options =
		value !== "" && !hasPresetValue
			? [{ emoji: value, label: "現在設定中" }, ...HABIT_EMOJI_OPTIONS]
			: HABIT_EMOJI_OPTIONS;
	const errorId = `${id}-error`;

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
				{options.map((option) => {
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
								name={id}
								onChange={() => onChange(option.emoji)}
								type="radio"
								value={option.emoji}
							/>
							<span aria-hidden="true">{option.emoji}</span>
						</label>
					);
				})}
			</div>
			<p className="mt-2 text-xs text-stone-500">
				矢印キーでも候補を移動できます。
			</p>
			{error ? (
				<p className="mt-1 text-sm text-red-700" id={errorId} role="alert">
					{error}
				</p>
			) : null}
		</fieldset>
	);
}
