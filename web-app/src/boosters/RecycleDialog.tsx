import { useCallback, useEffect, useRef, useState } from 'react'
import { GiRecycle } from 'react-icons/gi'

import { spriteUrlFor } from '../map'
import { useEscapeToClose } from '../ui'
import {
	BoosterError,
	fetchRecycle,
	recycleDuplicates,
	type RecyclableRarity,
	type RecycleOutcome,
	type RecyclePreview,
	type RecycleRules,
} from './api'
import { RARITY } from './rarity'

/** Plural labels, since the recap counts them. */
const PLURAL: Record<RecyclableRarity, [string, string]> = {
	common: ['commune', 'communes'],
	uncommon: ['peu commune', 'peu communes'],
	rare: ['rare', 'rares'],
}

const ORDER: RecyclableRarity[] = ['common', 'uncommon', 'rare']

/** `12,5 %`, never `12.5 %`. */
function percent(value: number): string {
	return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
}

function plural(count: number, rarity: RecyclableRarity): string {
	const [one, many] = PLURAL[rarity]
	return `${count} ${count > 1 ? many : one}`
}

/**
 * Turning spare copies into luckier packs.
 *
 * The screen a player reads before destroying part of their own collection, so
 * it is built around answering three questions in this order: *what exactly
 * leaves*, *what comes back*, and *what is protected*. The cards themselves are
 * shown — all of them, scrollable — because a count is easy to misread and a
 * wall of sprites is not: nobody clicks "transform" on 40 cards they cannot see.
 *
 * The arithmetic is spelled out rather than summarised. The player is trading
 * an asset for odds, and odds are the one thing a game must not be vague
 * about, so the shard value of each rarity, the leftovers carried in and out,
 * and the before/after draw table are all on screen before the button is live.
 *
 * Nothing here decides anything: the preview, the rates and the outcome all
 * come from the server, which is also the only thing that can honour them.
 */
export function RecycleDialog({
	onClose,
	onRecycled,
}: {
	onClose: () => void
	/** Fired once cards were actually destroyed, so the caller can reload. */
	onRecycled: () => void
}) {
	const [preview, setPreview] = useState<RecyclePreview | null>(null)
	const [rules, setRules] = useState<RecycleRules | null>(null)
	const [outcome, setOutcome] = useState<RecycleOutcome | null>(null)
	const [working, setWorking] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const backdrop = useRef<HTMLDivElement>(null)

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

	useEffect(() => {
		let cancelled = false
		fetchRecycle()
			.then(({ preview: found, rules: served }) => {
				if (cancelled) return
				setPreview(found)
				setRules(served)
			})
			.catch((cause) => {
				if (cancelled) return
				setError(cause instanceof BoosterError ? cause.message : 'Serveur injoignable')
			})
		return () => {
			cancelled = true
		}
	}, [])

	const transform = useCallback(async () => {
		setWorking(true)
		setError(null)
		try {
			const { outcome: done } = await recycleDuplicates()
			setOutcome(done)
			onRecycled()
		} catch (cause) {
			setError(cause instanceof BoosterError ? cause.message : 'Serveur injoignable')
			// Refused usually means the preview was stale — a camp levelled one of
			// these up, or another tab already melted them. Show the truth again.
			fetchRecycle()
				.then(({ preview: found }) => setPreview(found))
				.catch(() => undefined)
		} finally {
			setWorking(false)
		}
	}, [onRecycled])

	const luck = outcome?.luck ?? preview?.luck ?? 0
	const base = rules?.odds.find((entry) => entry.luck === 0)?.odds ?? null
	const boosted = rules?.odds.find((entry) => entry.luck === luck)?.odds ?? null

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			// Above the collection panel it was opened from, and dark enough that
			// the grid behind reads as out of reach rather than merely dimmed.
			className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-2 outline-none sm:p-4"
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label="Transformer mes doublons"
				className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141c17] text-slate-100 shadow-2xl"
			>
				<header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
					<h2 className="flex items-center gap-2 text-lg font-semibold">
						<GiRecycle aria-hidden className="h-5 w-5 text-emerald-300" />
						Transformer mes doublons
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				{error && (
					<p role="alert" className="shrink-0 bg-red-500/15 px-4 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					{outcome ? (
						/* Done. The cards are gone, so the recap talks about what was
						   gained and where to find it — the stock lives in another panel. */
						<div className="space-y-3">
							<p className="text-base text-slate-300">
								{outcome.recycled} doublon{outcome.recycled > 1 ? 's' : ''} recyclé
								{outcome.recycled > 1 ? 's' : ''} ·{' '}
								<span className="text-slate-400">{outcome.shards} éclats</span>
							</p>
							{outcome.boosters > 0 ? (
								<p className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-base text-amber-100">
									<strong className="font-semibold">
										{outcome.boosters} booster{outcome.boosters > 1 ? 's' : ''} chanceux
									</strong>{' '}
									à +{outcome.luck} % sur chaque rareté. À ouvrir dans l’onglet Booster.
								</p>
							) : (
								<p className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base text-slate-300">
									Pas encore de quoi faire un booster : les éclats sont gardés en réserve.
								</p>
							)}
							{outcome.remainder > 0 && (
								<p className="text-sm text-slate-500">
									{outcome.remainder} éclat{outcome.remainder > 1 ? 's' : ''} en réserve pour la prochaine
									fournée.
								</p>
							)}
						</div>
					) : preview === null ? (
						<p className="py-8 text-center text-base text-slate-500">Chargement…</p>
					) : preview.candidates.length === 0 ? (
						<div className="space-y-3 py-6 text-center">
							<p className="text-base text-slate-400">Aucun doublon à transformer.</p>
							<p className="text-sm text-slate-500">
								Un doublon se recycle s’il est en double, encore à son niveau de départ, ni légendaire, ni
								dans une équipe, ni en soins.
							</p>
							{preview.carried > 0 && (
								<p className="text-sm text-slate-500">
									{preview.carried} éclat{preview.carried > 1 ? 's' : ''} en réserve.
								</p>
							)}
						</div>
					) : (
						<div className="space-y-4">
							{/* 1. What leaves, counted. */}
							<div className="rounded-lg border border-white/10 bg-black/30 p-3">
								<p className="text-base text-slate-300">
									<strong className="font-semibold text-white">{preview.candidates.length} doublons</strong>{' '}
									seront définitivement recyclés.
								</p>
								<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
									{ORDER.filter((rarity) => preview.byRarity[rarity] > 0).map((rarity) => (
										<li key={rarity} className="text-slate-400">
											<span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-xs ${RARITY[rarity].chip}`}>
												{plural(preview.byRarity[rarity], rarity)}
											</span>
											{preview.byRarity[rarity]} × {rules?.shardValue[rarity] ?? '?'} éclat
											{(rules?.shardValue[rarity] ?? 0) > 1 ? 's' : ''}
										</li>
									))}
								</ul>
							</div>

							{/* 2. What comes back, with the arithmetic shown. */}
							<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3">
								<p className="text-base">
									<span className="text-slate-300">{preview.shards} éclats</span>
									{preview.carried > 0 && (
										<span className="text-slate-500"> + {preview.carried} en réserve</span>
									)}
									<span className="text-slate-500"> → </span>
									<strong className="font-semibold text-emerald-200">
										{preview.boosters} booster{preview.boosters > 1 ? 's' : ''} chanceux
									</strong>
									{preview.boosters > 0 && <span className="text-emerald-300"> à +{preview.luck} %</span>}
								</p>
								<p className="mt-1 text-sm text-slate-500">
									{rules?.shardsPerBooster ?? 10} éclats pour un booster. Plus les doublons sont rares, plus
									le bonus monte (jusqu’à +{rules?.maxLuck ?? 3} %).
									{preview.remainder > 0 &&
										` ${preview.remainder} éclat${preview.remainder > 1 ? 's' : ''} resteront en réserve.`}
								</p>

								{/* The table being bought, next to the one being left. */}
								{base && boosted && preview.boosters > 0 && (
									<ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
										{(Object.keys(base) as (keyof typeof base)[]).map((rarity) => (
											<li key={rarity} className="flex flex-col">
												<span className="text-xs text-slate-500">{RARITY[rarity].label}</span>
												<span className="tabular-nums">
													<span className="text-slate-500 line-through">{percent(base[rarity])}</span>{' '}
													<span style={{ color: RARITY[rarity].tint }}>{percent(boosted[rarity])}</span>
												</span>
											</li>
										))}
									</ul>
								)}
							</div>

							{/* 3. What is protected — the reassurance, right above the button. */}
							<p className="text-sm text-slate-500">
								Un exemplaire de chaque Pokémon est toujours conservé (le mieux entraîné), et rien
								d’entraîné, de légendaire, d’aligné dans une équipe ou en soins n’est touché.
							</p>

							{/* The cards themselves, so the count can be checked. */}
							<div>
								<p className="mb-2 text-sm text-slate-400">Cartes concernées</p>
								<ul className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
									{preview.candidates.map((candidate) => (
										<li
											key={candidate.cardId}
											title={`${candidate.name} — ${RARITY[candidate.rarity].label}`}
											className={`flex w-16 flex-col items-center rounded border bg-black/40 p-1 ${
												RARITY[candidate.rarity].ring
											}`}
										>
											<img
												src={spriteUrlFor(candidate.pokedexId)}
												alt=""
												className="h-10 w-10 [image-rendering:pixelated]"
												loading="lazy"
											/>
											<span className="w-full truncate text-center text-[11px] capitalize text-slate-300">
												{candidate.name}
											</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					)}
				</div>

				<footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
					{outcome ? (
						<button
							type="button"
							onClick={onClose}
							className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 hover:bg-emerald-400"
						>
							Continuer
						</button>
					) : (
						<>
							<button
								type="button"
								onClick={onClose}
								className="rounded-md border border-white/15 px-4 py-2 text-base text-slate-300 hover:bg-white/10 hover:text-white"
							>
								Annuler
							</button>
							<button
								type="button"
								onClick={() => void transform()}
								disabled={working || !preview || preview.candidates.length === 0}
								className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
							>
								{working
									? 'Transformation…'
									: preview && preview.candidates.length > 0
										? `Transformer ${preview.candidates.length} doublon${
												preview.candidates.length > 1 ? 's' : ''
											}`
										: 'Transformer'}
							</button>
						</>
					)}
				</footer>
			</section>
		</div>
	)
}
