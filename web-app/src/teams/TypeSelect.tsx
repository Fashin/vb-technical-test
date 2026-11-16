import { useEffect, useRef, useState } from 'react'
import { FiChevronDown, FiX } from 'react-icons/fi'

import { typeIcon, typeStyle } from '../pokemon'

/**
 * The type filter.
 *
 * A native `<select>` would be one line of markup, but it paints the
 * operating system's own dropdown — a white list in a dark panel — and it can
 * only hold text, so every type reads the same. This one is a button and a
 * list: each type keeps its colour and its glyph, which is how types are shown
 * everywhere else in the app.
 *
 * It behaves like a select where it counts: Escape closes it, a click outside
 * closes it, and the chosen value is announced on the button itself.
 */
export function TypeSelect({
	value,
	types,
	onChange,
}: {
	/** The selected type, or '' for all of them. */
	value: string
	/** Types offered, in canonical order — only the ones the player owns. */
	types: string[]
	onChange: (type: string) => void
}) {
	const [open, setOpen] = useState(false)
	const root = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return

		const onPointerDown = (event: PointerEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				// The panel behind also closes on Escape; this one is in front.
				event.stopPropagation()
				setOpen(false)
			}
		}

		document.addEventListener('pointerdown', onPointerDown, true)
		document.addEventListener('keydown', onKeyDown, true)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true)
			document.removeEventListener('keydown', onKeyDown, true)
		}
	}, [open])

	const selected = value ? typeStyle(value) : null
	const SelectedIcon = value ? typeIcon(value) : null

	return (
		<div ref={root} className="relative flex items-center gap-0.5">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={`Filtrer par type : ${selected?.label ?? 'tous les types'}`}
				className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-base transition ${
					selected
						? 'border-white/25 bg-white/10 text-slate-100'
						: 'border-white/10 bg-black/30 text-slate-300 hover:border-white/25'
				}`}
			>
				{SelectedIcon && selected ? (
					<SelectedIcon aria-hidden className="h-4 w-4" style={{ color: selected.tint }} />
				) : null}
				<span>{selected?.label ?? 'Tous les types'}</span>
				<FiChevronDown aria-hidden className={`h-4 w-4 text-slate-500 ${open ? 'rotate-180' : ''}`} />
			</button>

			{/* Clearing the filter without opening the list: the common next move. */}
			{selected && (
				<button
					type="button"
					onClick={() => onChange('')}
					aria-label="Afficher tous les types"
					title="Afficher tous les types"
					className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
				>
					<FiX className="h-3.5 w-3.5" />
				</button>
			)}

			{open && (
				<ul
					role="listbox"
					aria-label="Types"
					className="absolute left-0 top-full z-30 mt-1 max-h-72 w-48 overflow-y-auto rounded-md border border-white/15 bg-[#17201a] p-1 shadow-2xl"
				>
					<li>
						<button
							type="button"
							role="option"
							aria-selected={value === ''}
							onClick={() => {
								onChange('')
								setOpen(false)
							}}
							className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-base transition ${
								value === '' ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'
							}`}
						>
							Tous les types
						</button>
					</li>
					{types.map((type) => {
						const style = typeStyle(type)
						const Icon = typeIcon(type)
						return (
							<li key={type}>
								<button
									type="button"
									role="option"
									aria-selected={value === type}
									onClick={() => {
										onChange(type)
										setOpen(false)
									}}
									className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-base transition ${
										value === type ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'
									}`}
								>
									<Icon aria-hidden className="h-4 w-4 shrink-0" style={{ color: style.tint }} />
									{style.label}
								</button>
							</li>
						)
					})}
				</ul>
			)}
		</div>
	)
}
