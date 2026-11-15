import { API_URL, readToken } from '../auth/api'

/** Mirrored from `backend/src/battle/battles.ts`. */
export interface BattleFighter {
	pokedexId: number
	name: string
	types: string[]
	/** Earned in the training camps; drives both damage and the HP pool. */
	level: number
	speed: number
	/** Where it ended the fight — `hp` is the server's *final* figure. */
	hp: number
	maxHp: number
	/**
	 * Where it started the fight.
	 *
	 * Optional: an arena battle persisted before this field existed does not
	 * carry it, and a fight nobody walked into wounded started at `maxHp`.
	 */
	openingHp?: number
}

export interface Side {
	name: string
	team: BattleFighter[]
	/** Index into `team` of the Pokémon currently out. */
	active: number
}

export interface TurnEvent {
	side: 'player' | 'master'
	move: { name: string; type: string; category: 'physical' | 'special'; power: number }
	damage: number
	critical: boolean
	effectiveness: string | null
	fainted: boolean
	/**
	 * Who struck and who was hit, as indices into each side's team.
	 *
	 * The server states them, so the replay never has to work out who is on the
	 * field: in a training session a Pokémon also leaves it by winning, not only
	 * by fainting.
	 */
	sourceIndex: number
	targetIndex: number
	/** Sent out after a faint. */
	replacedBy: string | null
	/** Taken over from the attacker once it had put its own partner down. */
	handedOverTo: string | null
	/** Who is out on each side once this attack is resolved. */
	activeAfter: { player: number; master: number }
	/** The model's sentence for this attack, told while it plays out. */
	line: string
}

export interface RoundLog {
	round: number
	events: TurnEvent[]
}

export type BattleStatus = 'active' | 'won' | 'lost'

export interface Battle {
	id: string
	masterId: string
	masterName: string
	round: number
	player: Side
	master: Side
	status: BattleStatus
	/** Opening line, filled in once the battle has been resolved. */
	intro: string
	log: RoundLog[]
	/** Boosters won, null while the battle is still running. */
	reward: number | null
}

export class BattleError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message)
		this.name = 'BattleError'
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

	if (response.status === 204) return undefined as T
	const body = await response.json().catch(() => null)

	if (!response.ok) {
		const error = (body as { error?: { code: string; message: string } } | null)?.error
		throw new BattleError(error?.code ?? 'NETWORK', error?.message ?? 'Serveur injoignable')
	}
	return body as T
}

/** The battle in progress, so a reload drops straight back into it. */
export function fetchBattle(): Promise<{ battle: Battle | null; narrated: boolean }> {
	return send<{ battle: Battle | null; narrated: boolean }>('/arena/battle')
}

export function startBattle(masterId: string, teamId: string): Promise<{ battle: Battle; narrated: boolean }> {
	return send<{ battle: Battle; narrated: boolean }>('/arena/battle', {
		method: 'POST',
		body: JSON.stringify({ masterId, teamId }),
	})
}

/**
 * Resolve the whole battle in one request.
 *
 * The server asks the chatbot for the entire script, plays it out and answers
 * with the finished fight; the browser's job is to animate it, not to pace it.
 */
export function runBattle(): Promise<{ battle: Battle; degraded: boolean }> {
	return send<{ battle: Battle; degraded: boolean }>('/arena/battle/run', { method: 'POST' })
}

export function forfeitBattle(): Promise<void> {
	return send<void>('/arena/battle', { method: 'DELETE' })
}
