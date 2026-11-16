import { useCallback, useEffect, useRef } from 'react'
import { GiCardPickup, GiRecycle } from 'react-icons/gi'

import { Breadcrumb, useEscapeToClose } from '../ui'
import { RARITY, bestRarity } from './rarity'
import { RevealCard } from './RevealCard'
import { useReveal } from './useReveal'
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
 *
 * Two stocks, kept visually apart: the packs time hands out, and the lucky
 * ones bought with recycled duplicates. They open the same way and reveal the
 * same five cards, so the only thing the panel has to make unmistakable is
 * which one is being spent — a lucky pack cost cards, and spending one by
 * accident would be a real loss. Hence the separate block, the amber framing
 * and the bonus printed on the button rather than a single counter.
 *
 * The reveal confirms nothing. The pack is spent and its cards are in the
 * collection the moment the server answers, so every way out of the panel —
 * the button, « Fermer », Escape, a click on the backdrop — simply drops the
 * reveal. Nothing here can leave a pack half-opened, and nothing brings an
 * already-opened pack back on screen.
 */
export function BoosterPanel({ boosters, onClose }: { boosters: BoostersValue; onClose: () => void }) {
	const { state, remainingMs, cards, openedLuck, lucky, shards, opening, error, open, openLucky, dismiss, refresh } =
		boosters
	/** The stack that the one-click open would spend — the best one. */
	const bestLucky = lucky[0] ?? null
	const luckyTotal = lucky.reduce((sum, stack) => sum + stack.count, 0)
	const reveal = useReveal(cards)
	const backdrop = useRef<HTMLDivElement>(null)

	// Leaving the panel drops the reveal with it: the pack is already opened,
	// so coming back must show the stock, never the cards again.
	const close = useCallback(() => {
		dismiss()
		onClose()
	}, [dismiss, onClose])

	// Focus the panel so Escape reaches it rather than the map underneath.
	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(close)

	// The stock may have grown since the app booted — an arena win credits
	// boosters too. Always open on the truth.
	useEffect(() => refresh(), [refresh])

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 outline-none"
			// The map listens for arrow keys on its wrapper; the panel is a
			// separate context and must not make the character walk.
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				// Only a click on the backdrop itself, never one that bubbled up
				// from the dialog.
				if (event.target === event.currentTarget) close()
			}}
		>
			<section
				role="dialog"
				aria-label="Boosters"
				className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<Breadcrumb
						trail={[
							{ label: 'Carte', onClick: close },
							{ label: 'Boosters' },
						]}
						icon={GiCardPickup}
						tone="text-emerald-300"
					/>
					<button
						type="button"
						onClick={close}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				{cards ? (
					<div className="relative mt-4">
						{/* The burst is tinted by the best card in the pack, so the
						    colour already hints at the pull before anything turns over. */}
						{reveal.bursting && (
							<span
								aria-hidden
								className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 animate-pack-burst rounded-full"
								style={{ backgroundImage: RARITY[bestRarity(cards.map((c) => c.rarity))].burst }}
							/>
						)}

						<p className="text-base text-slate-300">
							{reveal.done ? 'Tu as obtenu :' : 'Ouverture du booster…'}
							{/* Which pack this was. Without it a recycled pack and a free
							    one look identical, and the trade would feel like nothing. */}
							{openedLuck > 0 && (
								<span className="ml-2 rounded bg-amber-300/20 px-1.5 py-0.5 text-sm text-amber-200">
									Booster chanceux · +{openedLuck} %
								</span>
							)}
						</p>

						<ul className="relative mt-3 flex flex-wrap justify-center gap-2">
							{cards.map((card, index) => (
								<RevealCard key={card.id} card={card} revealed={index < reveal.revealed} />
							))}
						</ul>

						{reveal.done ? (
							<>
								{/* Said out loud, because the button used to read like a
								    confirmation: there is nothing left to validate. */}
								<p className="mt-3 text-center text-sm text-slate-400">
									Booster ouvert · ces cartes sont dans ta collection.
								</p>
								<button
									type="button"
									onClick={dismiss}
									className="mt-3 w-full rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 hover:bg-emerald-400"
								>
									Retour aux boosters
								</button>
							</>
						) : (
							<button
								type="button"
								onClick={reveal.skip}
								className="mt-5 w-full rounded-md border border-white/15 px-4 py-2 text-base text-slate-300 hover:bg-white/10 hover:text-white"
							>
								Tout révéler
							</button>
						)}
					</div>
				) : (
					<div className="mt-4">
						<div className="rounded-lg border border-white/10 bg-black/30 p-3">
							<p className="text-base text-slate-400">Prochain booster</p>
							<p className="mt-0.5 text-3xl font-semibold tabular-nums">
								{state === null
									? '—'
									: state.nextInMs === null
										? 'Stock plein'
										: remainingMs === null
											? '—'
											: formatCountdown(remainingMs)}
							</p>
							{state && state.nextInMs !== null && (
								<p className="mt-1 text-sm text-slate-500">
									Un booster toutes les {Math.round(state.intervalMs / 60000)} min, {state.max} en réserve au
									maximum.
								</p>
							)}
							{state && state.nextInMs === null && (
								<p className="mt-1 text-sm text-slate-500">
									La réserve est pleine : ouvre un booster pour relancer le compteur.
								</p>
							)}
						</div>

						<p className="mt-4 text-base text-slate-300">
							{state ? `${state.pending} booster${state.pending > 1 ? 's' : ''} à ouvrir` : 'Chargement…'}
						</p>

						<ul className="mt-2 flex min-h-[72px] flex-wrap items-center gap-2">
							{state && state.pending > 0 ? (
								Array.from({ length: state.pending }, (_, index) => (
									<li
										key={index}
										className="flex h-20 w-14 items-center justify-center rounded-md border border-amber-300/40 bg-gradient-to-b from-amber-400/30 to-amber-700/30"
									>
										<GiCardPickup className="h-7 w-7 text-amber-200" />
									</li>
								))
							) : (
								<li className="text-base text-slate-500">Rien à ouvrir pour l’instant.</li>
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

						{/* Recycled packs. Drawn only once there is something to say
						    about them — an empty block would teach the feature to a
						    player who has no way to act on it from here. */}
						{(luckyTotal > 0 || shards > 0) && (
							<div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-400/5 p-3">
								<p className="flex items-center gap-2 text-base text-amber-100">
									<GiRecycle aria-hidden className="h-5 w-5 text-amber-200" />
									Boosters chanceux
								</p>

								{luckyTotal > 0 ? (
									<>
										<ul className="mt-2 flex flex-wrap items-center gap-2">
											{lucky.map((stack) => (
												<li
													key={stack.luck}
													className="flex items-center gap-1.5 rounded-md border border-amber-300/40 bg-gradient-to-b from-amber-400/30 to-amber-700/30 px-2 py-1.5 text-sm text-amber-100"
												>
													<GiCardPickup aria-hidden className="h-5 w-5 text-amber-200" />
													{stack.count} × +{stack.luck} %
												</li>
											))}
										</ul>
										<button
											type="button"
											onClick={() => void openLucky()}
											disabled={opening}
											className="mt-3 w-full rounded-md bg-amber-300 px-4 py-2 font-medium text-amber-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
										>
											{opening
												? 'Ouverture…'
												: `Ouvrir un booster chanceux (+${bestLucky?.luck ?? 0} %)`}
										</button>
									</>
								) : (
									<p className="mt-1 text-sm text-amber-100/70">
										Rien à ouvrir pour l’instant.
									</p>
								)}

								<p className="mt-2 text-sm text-slate-400">
									{shards > 0
										? `${shards} éclat${shards > 1 ? 's' : ''} en réserve. `
										: ''}
									Transforme tes doublons depuis « Ma collection » pour en gagner.
								</p>
							</div>
						)}
					</div>
				)}
			</section>
		</div>
	)
}
