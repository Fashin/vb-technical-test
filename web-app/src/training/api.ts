import { API_URL, readToken } from '../auth/api'
import type { Battle } from '../battle'
import type { Mentor, XpGain } from '../progression'

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
	/** Arena badges the camp asks for, and how many the player holds. */
	badgesRequired: number
	badgesOwned: number
	/** The badge gate is shut: nothing to do with the team's level. */
	locked: boolean
	unlocked: boolean
	/** Nobody in the team falls inside the band: nothing left to learn here. */
	exhausted: boolean
	/** Who opens the session: the least-trained member the camp can teach. */
	nextTrainee: { name: string; level: number } | null
	/** The band is covered, but only by Pokémon that are hurt or being treated. */
	allInCare: boolean
	/** How many Pokémon of the selected team would take the field. */
	roster: number
	/** How many are fit but sit this camp out: ceiling reached, or floor not. */
	benched: number
	/**
	 * The highest level this camp can carry a Pokémon to: one past `maxLevel`.
	 *
	 * The band accepts 1–25 but teaches up to 26, which is exactly what the
	 * next camp's floor requires. Shown, so the ceiling is not a surprise.
	 */
	ceiling: number
}

/**
 * What the team mates past the camp's ceiling added to the session.
 *
 * Mirrored from `backend/src/training/training.ts`. They earn nothing — they
 * are out of the band — but they multiply what every trainee below their
 * level is paid, and the same factor shortens a stay at the healing centre.
 */
export interface Mentoring {
	/** Who coached, best first. */
	mentors: Mentor[]
	/** The multiplier each trainee's share was raised by, keyed by card. */
	factors: Record<string, number>
	/** Experience the coaching itself paid, across the squad. */
	xpBonus: number
}

export interface TrainingSession {
	campId: string
	campName: string
	/** The fight, in the arena's own shape — the same player animates it. */
	battle: Battle
	xpEarned: number
	/** One entry per Pokémon that fought — the bench is simply not here. */
	gains: XpGain[]
	/** Who opened the session. */
	trainee: string
	/** The team that walked in. */
	teamId: string
	teamName: string
	band: { min: number; max: number; ceiling: number }
	/** The bench's contribution, or null when nobody has outgrown the camp. */
	mentoring: Mentoring | null
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

/**
 * The camps, measured against one team.
 *
 * `teamId` is the team the player has selected in the panel; without one the
 * server measures the active team.
 */
/** What the camps listing answers beside the camps themselves. */
export interface CampsState {
	camps: Camp[]
	/** Arena badges held. */
	badges: number
	/** The highest level any Pokémon can currently be trained to. */
	levelCap: number
	/** The next camp to open, and what it costs in badges. */
	nextCamp: { name: string; badges: number } | null
}

export function fetchCamps(teamId?: string): Promise<CampsState> {
	const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
	return send<CampsState>(`/training/camps${query}`)
}

/** Train one team once. The server decides what it meets and what it earns. */
export function trainAt(campId: string, teamId?: string): Promise<TrainingSession> {
	return send<TrainingSession>(`/training/${campId}/session`, {
		method: 'POST',
		body: JSON.stringify(teamId ? { teamId } : {}),
	})
}
