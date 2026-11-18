import { useEffect, useRef, useState } from 'react'
import { GiCardRandom, GiRecycle } from 'react-icons/gi'
import { FiSearch } from 'react-icons/fi'

import { Breadcrumb, useEscapeToClose } from '../ui'
import { CardFace } from '../boosters/CardFace'
import { RecycleDialog } from '../boosters/RecycleDialog'
import { LockedCard } from './LockedCard'
import { PokemonDetail } from './PokemonDetail'
import { RarityBars } from './RarityBars'
import { TypeGrid } from './TypeGrid'
import { DEX_TOTAL } from './dex'
import { useCollection, type SortMode } from './useCollection'

const SORTS: { mode: SortMode; label: string }[] = [
	{ mode: 'recent', label: 'Récentes' },
	{ mode: 'pokedex', label: 'Pokédex' },
	{ mode: 'rarity', label: 'Rareté' },
	{ mode: 'level', label: 'Niveau' },
]

/**
 * Everything the player has pulled.
 *
 * Nearly the whole screen, split in two: the filters live in a column on the
 * left and the cards fill the rest. A collection is browsed, not consulted —
 * the player comes to see what they have and to go looking for what they do
 * not, so the controls stay put on one side while the grid scrolls on the
 * other. Narrow screens stack the two, filters first.
 *
 * One tile per pokemon with a copy count, rather than one per card: duplicates
 * are the normal outcome of opening packs, and a wall of identical tiles would
 * hide what the collection actually contains. The totals in the sidebar always
 * describe the whole collection, never the filtered view — otherwise filtering
 * would look like losing cards.
 *
 * Searching and filtering happen on the client: the whole collection is already
 * in memory, so a round trip per keystroke would buy nothing.
 *
 * "Transformer mes doublons" is the one action the panel has ever offered, and
 * it is deliberately the only one: it belongs here because this is the screen
 * where the player *sees* that they own eleven Rattata. It is hidden outright
 * when browsing somebody else's collection — there is nothing to hide it from,
 * since the route is ours alone, but a button that cannot apply should not be
 * drawn at all.
 *
 * `trainer` points it at somebody else's cards — what you get from the player
 * standing next to you, beside the duel and the trade. Nothing is disabled for
 * that case because nothing in here was ever an action: the panel browses and
 * opens a Pokedex sheet, and both are as true of a stranger's collection as of
 * your own. Only the wording moves, so it is never in doubt whose cards these
 * are.
 */
export function CollectionPanel({
	trainer,
	onClose,
	onRecycled,
}: {
	/** Whose collection to show. Omitted for our own. */
	trainer?: { userId: string; name: string }
	onClose: () => void
	/**
	 * Fired when duplicates were turned into packs. The booster stock lives
	 * outside this panel, so whoever owns it is told to re-read it rather than
	 * being left showing a count that is now too low.
	 */
	onRecycled?: () => void
}) {
	const {
		loading,
		error,
		entries,
		total,
		unique,
		uniqueByRarity,
		uniqueByType,
		sort,
		setSort,
		rarityFilter,
		setRarityFilter,
		search,
		setSearch,
		typeFilter,
		setTypeFilter,
		missing,
		reload,
	} = useCollection(trainer?.userId)

	/** Which Pokémon the detail sheet is open on, if any. */
	const [detailId, setDetailId] = useState<number | null>(null)
	const [recycling, setRecycling] = useState(false)
	const backdrop = useRef<HTMLDivElement>(null)

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

	const filtering = search.trim() !== '' || rarityFilter !== null || typeFilter !== null
	const title = trainer ? `Collection de ${trainer.name}` : 'Ma collection'

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/60 p-2 outline-none sm:p-4"
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
				aria-label={title}
				className="my-auto flex h-full max-h-[96dvh] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141c17] text-slate-100 shadow-2xl"
			>
				<header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-white/10 px-4 py-3">
					<div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
						<Breadcrumb
							trail={[
								{ label: 'Carte', onClick: onClose },
								{ label: title },
							]}
							icon={GiCardRandom}
							tone="text-emerald-300"
						/>
						<p className="text-sm text-slate-400">
							{loading
								? 'Chargement…'
								: `${unique} / ${DEX_TOTAL} Pokémon · ${total} carte${total > 1 ? 's' : ''}`}
						</p>
					</div>
					<div className="flex items-center gap-2">
						{/* Our own collection only: there is nothing to recycle in
						    somebody else's, and the route would refuse anyway. */}
						{!trainer && (
							<button
								type="button"
								onClick={() => setRecycling(true)}
								className="flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20 hover:text-emerald-100"
							>
								<GiRecycle aria-hidden className="h-4 w-4" />
								Transformer mes doublons
							</button>
						)}
						<button
							type="button"
							onClick={onClose}
							className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
						>
							Fermer
						</button>
					</div>
				</header>

				{error && (
					<p role="alert" className="shrink-0 bg-red-500/15 px-4 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
					{/* Left: the filters, in the order they are reached for — the name
					    you remember first, then the tier you are completing, then the
					    type you are short of. */}
					{/* Stacked on a phone, the filters are capped at a share of the
					    screen and scroll on their own, so the cards are never pushed
					    entirely below the fold. */}
					<aside className="max-h-[45dvh] shrink-0 space-y-4 overflow-y-auto border-b border-white/10 p-4 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
						<div className="relative">
							<FiSearch
								aria-hidden
								className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
							/>
							<input
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Rechercher un Pokémon…"
								aria-label="Rechercher un Pokémon par son nom"
								className="w-full rounded-md border border-white/10 bg-black/30 py-2 pl-8 pr-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
							/>
						</div>

						<RarityBars uniqueByRarity={uniqueByRarity} active={rarityFilter} onPick={setRarityFilter} />

						<TypeGrid uniqueByType={uniqueByType} active={typeFilter} onPick={setTypeFilter} />
					</aside>

					{/* Right: what the filters left standing. */}
					<main className="flex min-h-0 min-w-0 flex-1 flex-col">
						<div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-white/10 px-4 py-2 text-sm">
							<p className="text-slate-400">
								{loading
									? ''
									: `${entries.length} Pokémon ${filtering ? 'trouvé' : 'obtenu'}${
											entries.length > 1 ? 's' : ''
										}`}
							</p>
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
						</div>

						<div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
							{loading ? null : total === 0 ? (
								<p className="pt-4 text-center text-base text-slate-500">
									{trainer
										? `${trainer.name} n’a encore aucune carte.`
										: 'Aucune carte pour l’instant — ouvre un booster pour commencer.'}
								</p>
							) : entries.length === 0 ? (
								<p className="pt-4 text-center text-base text-slate-500">
									Aucune carte ne correspond{filtering ? ' à cette recherche' : ''}.
								</p>
							) : (
								/*
								 * Re-keyed on the filters so the cards play their entrance
								 * again when the set changes — switching a filter should read
								 * as a change, not as a repaint. The search text is left out
								 * of the key on purpose: replaying on every keystroke would
								 * be worse than the abruptness it is meant to soften.
								 *
								 * A grid with a fixed row height, not a wrapping row: every
								 * tile gets the same box whatever its rarity label does, so
								 * "Peu commune" wrapping onto a second line can no longer
								 * push its neighbours' sprites out of line.
								 */
								<ul
									key={`${rarityFilter ?? 'all'}-${typeFilter ?? 'all'}-${sort}`}
									className="grid auto-rows-[15rem] justify-center gap-2 [grid-template-columns:repeat(auto-fill,8rem)]"
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
												className="h-full rounded-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
											>
												<CardFace card={entry} count={entry.count} className="h-full" />
											</button>
										</li>
									))}
								</ul>
							)}

							{/*
							 * What is still out there, blacked out.
							 *
							 * The dex is a fixed 151, so the gaps are part of the
							 * collection too: the screen is where a player goes looking
							 * for what they do not have, and an empty space says far less
							 * than a silhouette they might recognise. Only the shape is
							 * kept — the name and the level are withheld, so the tile is a
							 * target rather than a spoiler.
							 *
							 * Hidden while a filter is on: nothing is known about these
							 * beyond their number, so they cannot honestly answer a search
							 * for "pika" or for the legendary tier. Hidden too when
							 * browsing somebody else's collection, where the question is
							 * what they own, not what they are missing.
							 */}
							{!loading && !trainer && !filtering && missing.length > 0 && (
								<section className="space-y-2 border-t border-white/10 pt-4">
									<h3 className="text-sm text-slate-500">
										Encore à débloquer · {missing.length} Pokémon
									</h3>
									<ul className="grid auto-rows-[15rem] justify-center gap-2 [grid-template-columns:repeat(auto-fill,8rem)]">
										{missing.map((pokedexId) => (
											<li key={pokedexId}>
												<LockedCard pokedexId={pokedexId} className="h-full" />
											</li>
										))}
									</ul>
								</section>
							)}
						</div>
					</main>
				</div>
			</section>

			{detailId !== null && (
				<PokemonDetail pokedexId={detailId} from={title} onClose={() => setDetailId(null)} />
			)}

			{recycling && (
				<RecycleDialog
					onClose={() => setRecycling(false)}
					onRecycled={() => {
						// The grid behind is now wrong by however many cards were
						// melted: re-read it while the recap is still on screen, so
						// closing the dialog reveals the collection as it now is.
						reload()
						onRecycled?.()
					}}
				/>
			)}
		</div>
	)
}
