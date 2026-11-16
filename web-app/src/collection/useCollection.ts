import { useEffect, useMemo, useState } from 'react'

import { BoosterError, fetchCards, type Card, type Rarity } from '../boosters/api'
import { RARITY } from '../boosters/rarity'

/** One pokemon the player owns, with however many copies they have of it. */
export interface CollectionEntry {
	pokedexId: number
	name: string
	rarity: Rarity
	count: number
	/** Most recent pull of that pokemon, used to sort by "newest". */
	lastObtainedAt: number
	/**
	 * The best-trained copy. Duplicates are folded into one tile, so the tile
	 * shows the one the player would actually field rather than an arbitrary
	 * copy — two Rattata of level 4 and 40 are not the same asset.
	 */
	level: number
	ratio: number
	toNextLevel: number
	/** Condition of that same best-trained copy — the one you would field. */
	health: number
	fainted: boolean
	inCare: boolean
	/** Shared by every copy: the species' types and base stats. */
	types: string[]
	stats: { hp: number; attack: number; defense: number; speed: number } | null
}

export type SortMode = 'pokedex' | 'recent' | 'rarity' | 'level'

export interface CollectionValue {
	loading: boolean
	error: string | null
	/** Grouped, deduplicated, and sorted. */
	entries: CollectionEntry[]
	/**
	 * The raw cards, newest first — one entry per physical copy. The team
	 * builder needs these: a team holds specific cards, so two Rattata have to
	 * stay tellable apart.
	 */
	cards: Card[]
	/** Totals across the whole collection, never the filtered view. */
	total: number
	unique: number
	/**
	 * Distinct Pokémon owned per rarity and per type — what a completion bar
	 * counts. Copies are deliberately not counted: ten Rattata are still one
	 * species found, and a bar that filled past its own pool would be a lie.
	 */
	uniqueByRarity: Record<Rarity, number>
	uniqueByType: Record<string, number>
	sort: SortMode
	setSort: (mode: SortMode) => void
	rarityFilter: Rarity | null
	setRarityFilter: (rarity: Rarity | null) => void
	/** Free text matched against the Pokémon's name. */
	search: string
	setSearch: (search: string) => void
	/** Type the list is narrowed to, or null for all of them. */
	typeFilter: string | null
	setTypeFilter: (type: string | null) => void
	reload: () => void
}

/**
 * The player's cards, grouped by pokemon.
 *
 * Duplicates are the normal case in a pack-opening game, so the raw list is
 * folded into one tile per pokemon with a count — a hundred identical Rattata
 * tiles would tell the player nothing.
 */
export function useCollection(): CollectionValue {
	const [cards, setCards] = useState<Card[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [reloads, setReloads] = useState(0)
	const [sort, setSort] = useState<SortMode>('recent')
	const [rarityFilter, setRarityFilter] = useState<Rarity | null>(null)
	const [search, setSearch] = useState('')
	const [typeFilter, setTypeFilter] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		setError(null)

		fetchCards()
			.then(({ cards: found }) => {
				if (!cancelled) setCards(found)
			})
			.catch((cause) => {
				if (cancelled) return
				setError(cause instanceof BoosterError ? cause.message : 'Serveur injoignable')
				setCards([])
			})

		return () => {
			cancelled = true
		}
	}, [reloads])

	const grouped = useMemo<CollectionEntry[]>(() => {
		if (!cards) return []
		const byPokemon = new Map<number, CollectionEntry>()

		for (const card of cards) {
			const entry = byPokemon.get(card.pokedexId)
			if (entry) {
				entry.count += 1
				entry.lastObtainedAt = Math.max(entry.lastObtainedAt, card.obtainedAt)
				if (card.level > entry.level) {
					entry.level = card.level
					entry.ratio = card.ratio
					entry.toNextLevel = card.toNextLevel
					entry.health = card.health
					entry.fainted = card.fainted
					entry.inCare = card.inCare
				}
			} else {
				byPokemon.set(card.pokedexId, {
					pokedexId: card.pokedexId,
					name: card.name,
					rarity: card.rarity,
					count: 1,
					lastObtainedAt: card.obtainedAt,
					types: card.types ?? [],
					stats: card.stats ?? null,
					level: card.level,
					ratio: card.ratio,
					toNextLevel: card.toNextLevel,
					health: card.health,
					fainted: card.fainted,
					inCare: card.inCare,
				})
			}
		}

		return [...byPokemon.values()]
	}, [cards])

	const entries = useMemo(() => {
		// Accents and case are what a player types past, not what they mean.
		const needle = search.trim().toLowerCase()

		const visible = grouped.filter((entry) => {
			if (rarityFilter && entry.rarity !== rarityFilter) return false
			if (typeFilter && !entry.types.includes(typeFilter)) return false
			if (needle && !entry.name.toLowerCase().includes(needle)) return false
			return true
		})

		const sorted = [...visible]

		if (sort === 'level') sorted.sort((a, b) => b.level - a.level || a.pokedexId - b.pokedexId)
		else if (sort === 'pokedex') sorted.sort((a, b) => a.pokedexId - b.pokedexId)
		else if (sort === 'recent') sorted.sort((a, b) => b.lastObtainedAt - a.lastObtainedAt)
		else sorted.sort((a, b) => RARITY[b.rarity].order - RARITY[a.rarity].order || a.pokedexId - b.pokedexId)

		return sorted
	}, [grouped, rarityFilter, typeFilter, search, sort])

	const uniqueByRarity = useMemo(() => {
		const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 }
		for (const entry of grouped) counts[entry.rarity] += 1
		return counts
	}, [grouped])

	// A two-type Pokémon counts towards both, the same way the denominators in
	// `dex.ts` count it in both pools.
	const uniqueByType = useMemo(() => {
		const counts: Record<string, number> = {}
		for (const entry of grouped) for (const type of entry.types) counts[type] = (counts[type] ?? 0) + 1
		return counts
	}, [grouped])

	return {
		loading: cards === null,
		error,
		entries,
		cards: cards ?? [],
		total: cards?.length ?? 0,
		unique: grouped.length,
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
		reload: () => setReloads((n) => n + 1),
	}
}
