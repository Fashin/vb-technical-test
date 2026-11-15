import { API_URL, readToken } from '../auth/api'
import type { Appearance } from '../trainer'

/** Mirrored from `backend/src/ranking/leaderboard.ts`. */
export interface RankedTrainer {
	userId: string
	rank: number
	name: string
	spriteId: number
	appearance: Appearance
	/** Masters beaten, out of the whole arena roster. */
	masters: number
	mastersTotal: number
	/** Distinct Pokémon owned, against everything the boosters can give. */
	dexOwned: number
	dexTotal: number
	dexPercent: number
	cards: number
	/** Duels won against other trainers. */
	duels: number
	/** The best-trained Pokémon, and the camp that level belongs to. */
	bestLevel: number
	band: string | null
	/** Pokémon at the healing centre right now. */
	inCare: number
	online: boolean
	lastSeenAt: number
}

export class RankingError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message)
		this.name = 'RankingError'
	}
}

export async function fetchRanking(): Promise<{ trainers: RankedTrainer[]; you: string }> {
	const token = readToken()
	const response = await fetch(`${API_URL}/ranking`, {
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
	})

	const body = await response.json().catch(() => null)
	if (!response.ok) {
		const error = (body as { error?: { code: string; message: string } } | null)?.error
		throw new RankingError(error?.code ?? 'NETWORK', error?.message ?? 'Serveur injoignable')
	}
	return body as { trainers: RankedTrainer[]; you: string }
}
