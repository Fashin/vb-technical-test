import { useEffect, useRef } from 'react'
import { GiCardRandom } from 'react-icons/gi'

import { CardFace } from '../boosters/CardFace'
import { RARITY } from '../boosters/rarity'
import type { Rarity } from '../boosters/api'
import { useCollection, type SortMode } from './useCollection'

const SORTS: { mode: SortMode; label: string }[] = [
	{ mode: 'recent', label: 'Récentes' },
	{ mode: 'pokedex', label: 'Pokédex' },
	{ mode: 'rarity', label: 'Rareté' },
]

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'legendary']

/**
 * Everything the player has pulled.
 *
 * One tile per pokemon with a copy count, rather than one per card: duplicates
 * are the normal outcome of opening packs, and a wall of identical tiles would
 * hide what the collection actually contains. The totals in the header always
 * describe the whole collection, never the filtered view — otherwise filtering
 * would look like losing cards.
 */
export function CollectionPanel({ onClose }: { onClose: () => void }) {
	const { loading, error, entries, total, unique, byRarity, sort, setSort, rarityFilter, setRarityFilter } =
		useCollection()
	const backdrop = useRef<HTMLDivElement>(null)

	useEffect(() => backdrop.current?.focus(), [])

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 outline-none"
			// The map listens for arrow keys on its wrapper; the panel must not
			// make the character walk.
			onKeyDown={(event) => {
				event.stopPropagation()
				if (event.key === 'Escape') onClose()
			}}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label="Ma collection"
				className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<h2 className="flex items-center gap-2 text-lg font-semibold">
						<GiCardRandom className="h-5 w-5 text-emerald-300" />
						Ma collection
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				<p className="mt-1 text-sm text-slate-400">
					{loading ? 'Chargement…' : `${total} carte${total > 1 ? 's' : ''} · ${unique} Pokémon différent${unique > 1 ? 's' : ''}`}
				</p>

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">
						{error}
					</p>
				)}

				{!loading && total > 0 && (
					<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-white/10 py-2 text-xs">
						<div className="flex items-center gap-1">
							<span className="text-slate-500">Trier</span>
							{SORTS.map(({ mode, label }) => (
								<button
									key={mode}
									type="button"
									onClick={() => setSort(mode)}
									aria-pressed={sort === mode}
									className={`rounded px-2 py-1 ${
										sort === mode ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10'
									}`}
								>
									{label}
								</button>
							))}
						</div>

						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setRarityFilter(null)}
								aria-pressed={rarityFilter === null}
								className={`rounded px-2 py-1 ${
									rarityFilter === null ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10'
								}`}
							>
								Toutes
							</button>
							{RARITIES.map((rarity) => (
								<button
									key={rarity}
									type="button"
									onClick={() => setRarityFilter(rarityFilter === rarity ? null : rarity)}
									aria-pressed={rarityFilter === rarity}
									disabled={byRarity[rarity] === 0}
									className={`rounded px-2 py-1 disabled:opacity-30 ${
										rarityFilter === rarity ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10'
									}`}
								>
									{RARITY[rarity].label}
									<span className="ml-1 text-slate-500">{byRarity[rarity]}</span>
								</button>
							))}
						</div>
					</div>
				)}

				<div className="mt-4 min-h-[8rem] flex-1 overflow-y-auto">
					{loading ? null : total === 0 ? (
						<p className="py-8 text-center text-sm text-slate-500">
							Aucune carte pour l’instant — ouvre un booster pour commencer.
						</p>
					) : entries.length === 0 ? (
						<p className="py-8 text-center text-sm text-slate-500">Aucune carte de cette rareté.</p>
					) : (
						<ul className="flex flex-wrap justify-center gap-2">
							{entries.map((entry) => (
								<CardFace key={entry.pokedexId} card={entry} count={entry.count} />
							))}
						</ul>
					)}
				</div>
			</section>
		</div>
	)
}
