import { API_URL, readToken } from '../auth/api'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export interface Card {
	id: string
	pokedexId: number
	name: string
	rarity: Rarity
	obtainedAt: number
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

export interface BoosterState {
	pending: number
	max: number
	intervalMs: number
	cardsPerBooster: number
	/** When the next pack lands, or null when the stock is already full. */
	nextAt: number | null
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

export function openBooster(): Promise<{ cards: Card[]; state: BoosterState }> {
	return send<{ cards: Card[]; state: BoosterState }>('/boosters/open', { method: 'POST' })
}

export function fetchCards(): Promise<{ cards: Card[] }> {
	return send<{ cards: Card[] }>('/boosters/cards')
}
