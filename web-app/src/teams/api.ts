import { API_URL, readToken } from '../auth/api'
import type { Rarity } from '../boosters'

/** One card fielded in a team. Mirrored from `backend/src/teams/teams.ts`. */
export interface TeamMember {
	cardId: string
	pokedexId: number
	name: string
	rarity: Rarity
	/** Position, 0-based. */
	slot: number
}

export interface Team {
	id: string
	name: string
	createdAt: number
	members: TeamMember[]
}

export interface TeamsState {
	teams: Team[]
	/** The team taken into the arena, or null while none is chosen. */
	activeTeamId: string | null
	maxTeams: number
	teamSize: number
}

export class TeamError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message)
		this.name = 'TeamError'
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
		throw new TeamError(error?.code ?? 'NETWORK', error?.message ?? 'Serveur injoignable')
	}
	return body as T
}

export function fetchTeams(): Promise<TeamsState> {
	return send<TeamsState>('/teams')
}

export function createTeam(name: string): Promise<{ team: Team }> {
	return send<{ team: Team }>('/teams', { method: 'POST', body: JSON.stringify({ name }) })
}

export function renameTeam(teamId: string, name: string): Promise<{ name: string }> {
	return send<{ name: string }>(`/teams/${teamId}`, { method: 'PUT', body: JSON.stringify({ name }) })
}

export function deleteTeam(teamId: string): Promise<void> {
	return send<void>(`/teams/${teamId}`, { method: 'DELETE' })
}

/** Replace the whole roster; the array order is the slot order. */
export function setMembers(teamId: string, cardIds: string[]): Promise<{ team: Team }> {
	return send<{ team: Team }>(`/teams/${teamId}/members`, {
		method: 'PUT',
		body: JSON.stringify({ cardIds }),
	})
}

export function setActiveTeam(teamId: string | null): Promise<{ activeTeamId: string | null }> {
	return send<{ activeTeamId: string | null }>('/teams/active', {
		method: 'PUT',
		body: JSON.stringify({ teamId }),
	})
}
