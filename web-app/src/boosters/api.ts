import { API_URL, readToken } from '../auth/api'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export interface Card {
	id: string
	pokedexId: number
	name: string
	rarity: Rarity
	obtainedAt: number
	/** Lowercase PokeAPI type names, in slot order. Empty if the lookup failed. */
	types: string[]
	/** The four headline stats, or null when PokeAPI could not be reached. */
	stats: { hp: number; attack: number; defense: number; speed: number } | null
	/** Derived server-side from the card's experience; see `progression/`. */
	level: number
	xp: number
	toNextLevel: number
	ratio: number
	/** 0..1 of its maximum still standing — damage carried between fights. */
	health: number
	fainted: boolean
	/** True while it is at the healing centre, and so out of the roster. */
	inCare: boolean
	/** When its treatment finishes, or null when it is not at the centre. */
	healedAt: number | null
}

/** A stack of recycled packs sharing the same bonus. */
export interface LuckyStock {
	/** Bonus in percentage points, added to every tier above common. */
	luck: number
	count: number
}

export interface BoosterState {
	pending: number
	max: number
	intervalMs: number
	cardsPerBooster: number
	/** Delay until the next pack, or null when the stock is already full. */
	nextInMs: number | null
	/** Packs bought with recycled duplicates, best luck first. */
	lucky: LuckyStock[]
	/** Recycling shards not yet worth a whole pack. */
	shards: number
}

/** Rarities a duplicate can be melted into shards for — never a legendary. */
export type RecyclableRarity = 'common' | 'uncommon' | 'rare'

export interface RecycleCandidate {
	cardId: string
	pokedexId: number
	name: string
	rarity: RecyclableRarity
	obtainedAt: number
}

/**
 * What "transformer mes doublons" would consume and produce.
 *
 * Mirrored from `backend/src/boosters/recycle.ts`, which is also where the
 * eligibility rules live: a spare copy, still at its starting level, not
 * legendary, not in a team, not at the healing centre.
 */
export interface RecyclePreview {
	candidates: RecycleCandidate[]
	byRarity: Record<RecyclableRarity, number>
	/** Shards the candidates are worth, before leftovers are added in. */
	shards: number
	/** Shards left from earlier transformations, which join this batch. */
	carried: number
	boosters: number
	luck: number
	remainder: number
}

export interface RecycleRules {
	shardValue: Record<RecyclableRarity, number>
	shardsPerBooster: number
	maxLuck: number
	odds: { luck: number; odds: Record<Rarity, number> }[]
}

export interface RecycleOutcome {
	byRarity: Record<RecyclableRarity, number>
	recycled: number
	shards: number
	carried: number
	boosters: number
	luck: number
	remainder: number
}

export class BoosterError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message)
		this.name = 'BoosterError'
	}
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = readToken()
	const response = await fetch(`${API_URL}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...init.headers,
		},
	})

	const body = await response.json().catch(() => null)
	if (!response.ok) {
		const error = (body as { error?: { code: string; message: string } } | null)?.error
		throw new BoosterError(error?.code ?? 'NETWORK', error?.message ?? 'Serveur injoignable')
	}
	return body as T
}

export function fetchState(): Promise<{ state: BoosterState }> {
	return send<{ state: BoosterState }>('/boosters')
}

export function openBooster(): Promise<{ cards: Card[]; state: BoosterState; luck: number }> {
	return send<{ cards: Card[]; state: BoosterState; luck: number }>('/boosters/open', { method: 'POST' })
}

/** Open the best pack the recycled duplicates bought. */
export function openLuckyBooster(): Promise<{ cards: Card[]; state: BoosterState; luck: number }> {
	return send<{ cards: Card[]; state: BoosterState; luck: number }>('/boosters/open-lucky', { method: 'POST' })
}

export function fetchRecycle(): Promise<{ preview: RecyclePreview; rules: RecycleRules }> {
	return send<{ preview: RecyclePreview; rules: RecycleRules }>('/boosters/recycle')
}

export function recycleDuplicates(): Promise<{ outcome: RecycleOutcome; state: BoosterState }> {
	return send<{ outcome: RecycleOutcome; state: BoosterState }>('/boosters/recycle', { method: 'POST' })
}

export function fetchCards(): Promise<{ cards: Card[] }> {
	return send<{ cards: Card[] }>('/boosters/cards')
}

/**
 * Another trainer's collection, read-only.
 *
 * Same card shape as our own, so the collection panel can browse either one
 * without knowing whose it is. Mirrored from
 * `backend/src/controllers/TrainerController.ts`.
 */
export function fetchTrainerCards(userId: string): Promise<{ cards: Card[] }> {
	return send<{ cards: Card[] }>(`/trainers/${encodeURIComponent(userId)}/collection`)
}
