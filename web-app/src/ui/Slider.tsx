import type { ReactNode } from 'react'

/**
 * A slider for a setting that applies while it is being dragged.
 *
 * A real `<input type="range">` kept visible rather than a div wearing
 * `role="slider"`: it already brings keyboard focus, the arrow keys, Home and
 * End, touch dragging and screen-reader announcements, and none of that has to
 * be re-implemented. Only the track and the thumb are restyled, through the
 * vendor pseudo-elements, since Tailwind cannot reach them from a class.
 *
 * `value` is `0…1`; the number shown beside the label is a percentage, which is
 * how a volume is read even though it is stored as a fraction.
 */
export function Slider({
	value,
	onChange,
	label,
	hint,
	disabled = false,
}: {
	value: number
	onChange: (value: number) => void
	label: ReactNode
	/** One line under the label, for what the setting actually covers. */
	hint?: ReactNode
	disabled?: boolean
}) {
	const percent = Math.round(value * 100)

	return (
		<label
			className={`block rounded-lg border px-3 py-2 transition ${
				disabled
					? 'cursor-not-allowed border-white/5 opacity-40'
					: 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30'
			}`}
		>
			<span className="flex items-baseline justify-between gap-3">
				<span className="min-w-0 text-base text-slate-200">{label}</span>
				{/* `tabular-nums` so the row does not shuffle while dragging. */}
				<span className="shrink-0 text-sm tabular-nums text-slate-400">
					{percent === 0 ? 'Muet' : `${percent} %`}
				</span>
			</span>

			<input
				type="range"
				min={0}
				max={100}
				step={1}
				value={percent}
				disabled={disabled}
				onChange={(event) => onChange(Number(event.target.value) / 100)}
				aria-valuetext={percent === 0 ? 'Muet' : `${percent} pour cent`}
				className="mt-2 h-6 w-full cursor-pointer appearance-none bg-transparent outline-none disabled:cursor-not-allowed
					[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full
					[&::-webkit-slider-runnable-track]:bg-white/15
					[&::-webkit-slider-thumb]:-mt-[7px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
					[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
					[&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:shadow
					[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/15
					[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none
					[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-sky-400
					focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-sky-300
					focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-sky-300"
			/>

			{hint && <span className="block text-sm text-slate-500">{hint}</span>}
		</label>
	)
}
