import { useEffect, useRef } from 'react'
import { GiCardPickup } from 'react-icons/gi'

import { CardFace } from './CardFace'
import type { BoostersValue } from './useBoosters'

function formatCountdown(ms: number): string {
	const total = Math.ceil(ms / 1000)
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const seconds = total % 60
	const pad = (n: number) => String(n).padStart(2, '0')
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/**
 * Booster stock, countdown, and the reveal after opening one.
 *
 * Two states in one panel: the stock (how many packs are waiting, how long
 * until the next) and, once a pack is opened, the cards it held. The reveal
 * replaces the stock rather than stacking on top of it — a modal over a modal
 * is where a HUD starts to feel like a settings menu.
 */
export function BoosterPanel({ boosters, onClose }: { boosters: BoostersValue; onClose: () => void }) {
	const { state, remainingMs, cards, opening, error, open, dismiss } = boosters
	const backdrop = useRef<HTMLDivElement>(null)

	// Focus the panel so Escape reaches it rather than the map underneath.
	useEffect(() => backdrop.current?.focus(), [])

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 outline-none"
			// The map listens for arrow keys on its wrapper; the panel is a
			// separate context and must not make the character walk.
			onKeyDown={(event) => {
				event.stopPropagation()
				if (event.key === 'Escape') onClose()
			}}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				// Only a click on the backdrop itself, never one that bubbled up
				// from the dialog.
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label="Boosters"
				className="w-full max-w-md rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<h2 className="flex items-center gap-2 text-lg font-semibold">
						<GiCardPickup className="h-5 w-5 text-emerald-300" />
						Boosters
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">
						{error}
					</p>
				)}

				{cards ? (
					<div className="mt-4">
						<p className="text-sm text-slate-300">Tu as obtenu&nbsp;:</p>
						<ul className="mt-3 flex flex-wrap justify-center gap-2">
							{cards.map((card) => (
								<CardFace key={card.id} card={card} />
							))}
						</ul>
						<button
							type="button"
							onClick={dismiss}
							className="mt-5 w-full rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 hover:bg-emerald-400"
						>
							Continuer
						</button>
					</div>
				) : (
					<div className="mt-4">
						<div className="rounded-lg border border-white/10 bg-black/30 p-3">
							<p className="text-sm text-slate-400">Prochain booster</p>
							<p className="mt-0.5 text-2xl font-semibold tabular-nums">
								{state === null
									? '—'
									: state.nextAt === null
										? 'Stock plein'
										: remainingMs === null
											? '—'
											: formatCountdown(remainingMs)}
							</p>
							{state && state.nextAt !== null && (
								<p className="mt-1 text-xs text-slate-500">
									Un booster toutes les {Math.round(state.intervalMs / 60000)} min, {state.max} en réserve au
									maximum.
								</p>
							)}
							{state && state.nextAt === null && (
								<p className="mt-1 text-xs text-slate-500">
									La réserve est pleine : ouvre un booster pour relancer le compteur.
								</p>
							)}
						</div>

						<p className="mt-4 text-sm text-slate-300">
							{state ? `${state.pending} booster${state.pending > 1 ? 's' : ''} à ouvrir` : 'Chargement…'}
						</p>

						<ul className="mt-2 flex min-h-[72px] flex-wrap items-center gap-2">
							{state && state.pending > 0 ? (
								Array.from({ length: state.pending }, (_, index) => (
									<li
										key={index}
										className="flex h-16 w-12 items-center justify-center rounded-md border border-amber-300/40 bg-gradient-to-b from-amber-400/30 to-amber-700/30"
									>
										<GiCardPickup className="h-6 w-6 text-amber-200" />
									</li>
								))
							) : (
								<li className="text-sm text-slate-500">Rien à ouvrir pour l’instant.</li>
							)}
						</ul>

						<button
							type="button"
							onClick={() => void open()}
							disabled={opening || !state || state.pending === 0}
							className="mt-4 w-full rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{opening ? 'Ouverture…' : 'Ouvrir un booster'}
						</button>
					</div>
				)}
			</section>
		</div>
	)
}
