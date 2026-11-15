import { useEffect, useRef, useState } from 'react'
import { GiCardRandom } from 'react-icons/gi'

import { Breadcrumb, useEscapeToClose } from '../ui'
import { CardFace } from '../boosters/CardFace'
import { RARITY } from '../boosters/rarity'
import type { Rarity } from '../boosters/api'
import { typeStyle } from '../pokemon'
import { PokemonDetail } from './PokemonDetail'
import { RarityDonut } from './RarityDonut'
import { useCollection, type SortMode } from './useCollection'

const SORTS: { mode: SortMode; label: string }[] = [
	{ mode: 'recent', label: 'Récentes' },
	{ mode: 'pokedex', label: 'Pokédex' },
	{ mode: 'rarity', label: 'Rareté' },
	{ mode: 'level', label: 'Niveau' },
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
 *
 * Searching and filtering happen on the client: the whole collection is already
 * in memory, so a round trip per keystroke would buy nothing.
 */
export function CollectionPanel({ onClose }: { onClose: () => void }) {
	const {
		loading,
		error,
		entries,
		total,
		unique,
		byRarity,
		sort,
		setSort,
		rarityFilter,
		setRarityFilter,
		search,
		setSearch,
		typeFilter,
		setTypeFilter,
		ownedTypes,
	} = useCollection()

	/** Which Pokémon the detail sheet is open on, if any. */
	const [detailId, setDetailId] = useState<number | null>(null)
	const backdrop = useRef<HTMLDivElement>(null)

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

	const filtering = search.trim() !== '' || rarityFilter !== null || typeFilter !== null

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 outline-none"
			// The map listens for arrow keys on its wrapper; the panel must not
			// make the character walk.
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label="Ma collection"
				className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<Breadcrumb
						trail={[
							{ label: 'Carte', onClick: onClose },
							{ label: 'Ma collection' },
						]}
						icon={GiCardRandom}
						tone="text-emerald-300"
					/>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				<p className="mt-1 text-base text-slate-400">
					{loading
						? 'Chargement…'
						: `${unique} Pokémon différent${unique > 1 ? 's' : ''} sur les 151 obtenables`}
				</p>

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				{!loading && total > 0 && (
					<>
						<div className="mt-3">
							<RarityDonut byRarity={byRarity} total={total} />
						</div>

						<input
							type="search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Rechercher un Pokémon…"
							aria-label="Rechercher un Pokémon par son nom"
							className="mt-3 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
						/>

						<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-white/10 py-2 text-sm">
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

							{/* Only the types actually owned: eighteen dead buttons help nobody. */}
							{ownedTypes.length > 0 && (
								<div className="flex flex-wrap items-center gap-1">
									<span className="text-slate-500">Type</span>
									{ownedTypes.map((type) => {
										const style = typeStyle(type)
										const active = typeFilter === type
										return (
											<button
												key={type}
												type="button"
												onClick={() => setTypeFilter(active ? null : type)}
												aria-pressed={active}
												className={`rounded px-2 py-1 font-medium transition ${
													active ? style.chip : 'text-slate-400 hover:bg-white/10'
												}`}
											>
												{style.label}
											</button>
										)
									})}
								</div>
							)}
						</div>
					</>
				)}

				<div className="mt-4 min-h-[8rem] flex-1 overflow-y-auto">
					{loading ? null : total === 0 ? (
						<p className="py-8 text-center text-base text-slate-500">
							Aucune carte pour l’instant — ouvre un booster pour commencer.
						</p>
					) : entries.length === 0 ? (
						<p className="py-8 text-center text-base text-slate-500">
							Aucune carte ne correspond{filtering ? ' à cette recherche' : ''}.
						</p>
					) : (
						/*
						 * Re-keyed on the filters so the cards play their entrance
						 * again when the set changes — switching a filter should read
						 * as a change, not as a repaint. The search text is left out
						 * of the key on purpose: replaying on every keystroke would
						 * be worse than the abruptness it is meant to soften.
						 */
						<ul
							key={`${rarityFilter ?? 'all'}-${typeFilter ?? 'all'}-${sort}`}
							className="flex flex-wrap justify-center gap-2"
						>
							{entries.map((entry, index) => (
								<li
									key={entry.pokedexId}
									// Capped: a stagger that keeps growing would make the
									// hundredth card arrive two seconds late.
									style={{ animationDelay: `${Math.min(index, 14) * 20}ms` }}
									className="animate-card-in motion-reduce:animate-none"
								>
									<button
										type="button"
										onClick={() => setDetailId(entry.pokedexId)}
										aria-label={`Voir la fiche de ${entry.name}`}
										className="rounded-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
									>
										<CardFace card={entry} count={entry.count} />
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</section>

			{detailId !== null && <PokemonDetail pokedexId={detailId} onClose={() => setDetailId(null)} />}
		</div>
	)
}
