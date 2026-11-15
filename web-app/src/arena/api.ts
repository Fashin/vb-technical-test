import { API_URL, readToken } from '../auth/api'
import type { Appearance } from '../trainer'

/** A PvE opponent. Mirrored from `backend/src/arena/masters.ts`. */
export interface Master {
	id: string
	name: string
	title: string
	/** Pokemon type, lowercase, as PokeAPI names it. */
	type: string
	blurb: string
	/** Difficulty, 1 to 10. */
	tier: number
	/** Pokedex ids of the three fighters, in the order they are sent out. */
	team: number[]
	/** Boosters awarded the first time this master is beaten. */
	reward: number
	/** The level its whole team fights at, from its tier. */
	level: number
	appearance: Appearance
	defeated: boolean
	defeatedAt: number | null
}

export class ArenaError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message)
		this.name = 'ArenaError'
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
		throw new ArenaError(error?.code ?? 'NETWORK', error?.message ?? 'Serveur injoignable')
	}
	return body as T
}

export function fetchMasters(): Promise<{ masters: Master[] }> {
	return send<{ masters: Master[] }>('/arena/masters')
}
