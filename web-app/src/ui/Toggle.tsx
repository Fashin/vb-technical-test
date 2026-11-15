import type { ReactNode } from 'react'

/**
 * A switch for a setting that takes effect immediately.
 *
 * Built around a real `<input type="checkbox">` kept visually hidden rather
 * than a `<div>` wearing `role="switch"`: the checkbox already brings keyboard
 * focus, the space bar, form semantics and screen-reader announcements, and
 * none of that has to be re-implemented. The track and its knob are drawn with
 * `peer-checked`, so the visible part always follows the real state instead of
 * tracking it in parallel.
 *
 * Use it for a setting that applies at once — a toggle that needs a "save"
 * button is a checkbox, not a switch.
 */
export function Toggle({
	checked,
	onChange,
	label,
	hint,
	disabled = false,
}: {
	checked: boolean
	onChange: (checked: boolean) => void
	label: ReactNode
	/** One line under the label, for what turning it on actually does. */
	hint?: ReactNode
	disabled?: boolean
}) {
	return (
		<label
			className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
				disabled
					? 'cursor-not-allowed border-white/5 opacity-40'
					: 'cursor-pointer border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30'
			}`}
		>
			<input
				type="checkbox"
				className="peer sr-only"
				checked={checked}
				disabled={disabled}
				onChange={(event) => onChange(event.target.checked)}
			/>

			{/* The track, with the knob as its ::after so `peer-checked` can reach it. */}
			<span
				aria-hidden
				className="relative h-6 w-11 shrink-0 rounded-full bg-white/15 transition-colors
					after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full
					after:bg-slate-300 after:shadow after:transition-transform after:content-['']
					peer-checked:bg-sky-500 peer-checked:after:translate-x-5 peer-checked:after:bg-white
					peer-focus-visible:ring-2 peer-focus-visible:ring-sky-300 peer-focus-visible:ring-offset-2
					peer-focus-visible:ring-offset-[#141c17]"
			/>

			<span className="min-w-0">
				<span className="block text-base text-slate-200">{label}</span>
				{hint && <span className="mt-0.5 block text-sm text-slate-500">{hint}</span>}
			</span>
		</label>
	)
}
