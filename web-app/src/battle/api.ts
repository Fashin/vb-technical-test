import { API_URL, readToken } from '../auth/api'

/** Mirrored from `backend/src/battle/battles.ts`. */
export interface BattleFighter {
	pokedexId: number
	name: string
	types: string[]
	speed: number
	hp: number
	maxHp: number
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
	replacedBy: string | null
}

export interface RoundLog {
	round: number
	narration: string
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

export function playTurn(): Promise<{ battle: Battle; round: RoundLog; degraded: boolean }> {
	return send<{ battle: Battle; round: RoundLog; degraded: boolean }>('/arena/battle/turn', { method: 'POST' })
}

export function forfeitBattle(): Promise<void> {
	return send<void>('/arena/battle', { method: 'DELETE' })
}
