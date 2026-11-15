import { API_URL, readToken } from '../auth/api'
import type { Battle } from '../battle'
import type { XpGain } from '../progression'

/** Mirrored from `backend/src/training/training.ts` and `training/camps.ts`. */
export interface Camp {
	id: string
	name: string
	title: string
	blurb: string
	anchor: string
	/** Levels this camp accepts, and the ceiling past which it teaches nothing. */
	minLevel: number
	maxLevel: number
	wild: number[]
	x: number
	y: number
	/** Best level in the active team — what the camp measures you against. */
	teamLevel: number
	unlocked: boolean
	/** Nobody in the team falls inside the band: nothing left to learn here. */
	exhausted: boolean
	/** Who the camp would send out next: its least-trained eligible member. */
	nextTrainee: { name: string; level: number } | null
	/** The band is covered, but only by Pokémon that are hurt or being treated. */
	allInCare: boolean
}

export interface TrainingSession {
	campId: string
	campName: string
	/** The fight, in the arena's own shape — the same player animates it. */
	battle: Battle
	xpEarned: number
	/** One entry per Pokémon that fought — the bench is simply not here. */
	gains: XpGain[]
	/** Who led the session. */
	trainee: string
	band: { min: number; max: number }
}

export class TrainingError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message)
		this.name = 'TrainingError'
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
		throw new TrainingError(error?.code ?? 'NETWORK', error?.message ?? 'Serveur injoignable')
	}
	return body as T
}

export function fetchCamps(): Promise<{ camps: Camp[] }> {
	return send<{ camps: Camp[] }>('/training/camps')
}

/** Train the active team once. The server decides what it meets and what it earns. */
export function trainAt(campId: string): Promise<TrainingSession> {
	return send<TrainingSession>(`/training/${campId}/session`, { method: 'POST' })
}
