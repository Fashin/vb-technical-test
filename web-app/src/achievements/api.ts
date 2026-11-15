import { API_URL, readToken } from '../auth/api'

/** Mirrored from `backend/src/achievements/catalogue.ts`. */
export type Category = 'arene' | 'pokedex' | 'entrainement' | 'dresseur'

export interface Achievement {
	id: string
	name: string
	description: string
	category: Category
	/** What "done" means; `progress` is counted against it. */
	target: number
	progress: number
	unlocked: boolean
	/** When it was earned, when the underlying table knows — null otherwise. */
	unlockedAt: number | null
}

export interface AchievementSummary {
	achievements: Achievement[]
	unlocked: number
	total: number
	/** Category labels, so the panel keeps no copy of the catalogue's wording. */
	categories: Record<Category, string>
}

export class AchievementError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message)
		this.name = 'AchievementError'
	}
}

export async function fetchAchievements(): Promise<AchievementSummary> {
	const token = readToken()
	const response = await fetch(`${API_URL}/achievements`, {
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
	})

	const body = await response.json().catch(() => null)
	if (!response.ok) {
		const error = (body as { error?: { code: string; message: string } } | null)?.error
		throw new AchievementError(error?.code ?? 'NETWORK', error?.message ?? 'Serveur injoignable')
	}
	return body as AchievementSummary
}
