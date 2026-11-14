import { randomUUID } from 'crypto'

import { db } from '../db'

/**
 * Battle teams.
 *
 * A team holds up to six *cards*, not six Pokemon species: the player picks
 * from what the boosters actually gave them, so a duplicate Rattata is two
 * distinct cards and either can be benched. Deleting a card takes it out of
 * every team through the cascade, which is why members reference `cards(id)`.
 *
 * A card may sit in several teams at once — teams are loadouts, not exclusive
 * ownership — but never twice in the same one.
 */

/** Slots per team, as in the games. */
export const TEAM_SIZE = 6

/** How many teams one account may keep. */
export const MAX_TEAMS = 6

export const NAME_MAX = 24

export interface TeamMember {
	cardId: string
	pokedexId: number
	name: string
	rarity: string
	slot: number
}

export interface Team {
	id: string
	name: string
	createdAt: number
	members: TeamMember[]
}

interface TeamRow {
	id: string
	name: string
	created_at: number
}

interface MemberRow {
	team_id: string
	slot: number
	card_id: string
	pokedex_id: number
	name: string
	rarity: string
}

function membersOf(teamIds: string[]): Map<string, TeamMember[]> {
	const byTeam = new Map<string, TeamMember[]>()
	if (teamIds.length === 0) return byTeam

	const placeholders = teamIds.map(() => '?').join(', ')
	const rows = db
		.prepare(
			`SELECT m.team_id, m.slot, m.card_id, c.pokedex_id, c.name, c.rarity
			 FROM team_members m
			 JOIN cards c ON c.id = m.card_id
			 WHERE m.team_id IN (${placeholders})
			 ORDER BY m.slot`,
		)
		.all(...teamIds) as MemberRow[]

	for (const row of rows) {
		const list = byTeam.get(row.team_id) ?? []
		list.push({
			cardId: row.card_id,
			pokedexId: row.pokedex_id,
			name: row.name,
			rarity: row.rarity,
			slot: row.slot,
		})
		byTeam.set(row.team_id, list)
	}
	return byTeam
}

export function listTeams(userId: string): Team[] {
	const rows = db
		.prepare('SELECT id, name, created_at FROM teams WHERE user_id = ? ORDER BY created_at')
		.all(userId) as TeamRow[]

	const members = membersOf(rows.map((row) => row.id))

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		createdAt: row.created_at,
		members: members.get(row.id) ?? [],
	}))
}

export function getTeam(userId: string, teamId: string): Team | null {
	const row = db
		.prepare('SELECT id, name, created_at FROM teams WHERE id = ? AND user_id = ?')
		.get(teamId, userId) as TeamRow | undefined
	if (!row) return null

	return {
		id: row.id,
		name: row.name,
		createdAt: row.created_at,
		members: membersOf([row.id]).get(row.id) ?? [],
	}
}

export function countTeams(userId: string): number {
	return (db.prepare('SELECT COUNT(*) AS c FROM teams WHERE user_id = ?').get(userId) as { c: number }).c
}

export function createTeam(userId: string, name: string): Team {
	const id = randomUUID()
	db.prepare('INSERT INTO teams (id, user_id, name, created_at) VALUES (?, ?, ?, ?)').run(
		id,
		userId,
		name,
		Date.now(),
	)
	return getTeam(userId, id)!
}

export function renameTeam(userId: string, teamId: string, name: string): boolean {
	return db.prepare('UPDATE teams SET name = ? WHERE id = ? AND user_id = ?').run(name, teamId, userId).changes > 0
}

export function deleteTeam(userId: string, teamId: string): boolean {
	const removed = db.prepare('DELETE FROM teams WHERE id = ? AND user_id = ?').run(teamId, userId).changes > 0
	// Deleting the active team leaves the account with none selected rather
	// than pointing at a row that no longer exists.
	if (removed) {
		db.prepare('UPDATE users SET active_team_id = NULL WHERE id = ? AND active_team_id = ?').run(userId, teamId)
	}
	return removed
}

export type SetMembersResult =
	| { ok: true; team: Team }
	| { ok: false; reason: 'NOT_FOUND' | 'TOO_MANY' | 'NOT_OWNED' }

/**
 * Replace a team's whole roster in one write.
 *
 * Setting the full list rather than exposing add/remove endpoints keeps the
 * slots consistent: there is no window where a team briefly holds seven
 * members or two cards claim slot 3.
 */
export function setMembers(userId: string, teamId: string, cardIds: string[]): SetMembersResult {
	const team = getTeam(userId, teamId)
	if (!team) return { ok: false, reason: 'NOT_FOUND' }

	// Order is the slot order, so dedupe without sorting.
	const unique = [...new Set(cardIds)]
	if (unique.length > TEAM_SIZE) return { ok: false, reason: 'TOO_MANY' }

	if (unique.length > 0) {
		const placeholders = unique.map(() => '?').join(', ')
		const owned = db
			.prepare(`SELECT COUNT(*) AS c FROM cards WHERE user_id = ? AND id IN (${placeholders})`)
			.get(userId, ...unique) as { c: number }
		// A card the player does not own cannot be fielded, whatever the client says.
		if (owned.c !== unique.length) return { ok: false, reason: 'NOT_OWNED' }
	}

	const replace = db.transaction(() => {
		db.prepare('DELETE FROM team_members WHERE team_id = ?').run(teamId)
		const insert = db.prepare('INSERT INTO team_members (team_id, slot, card_id) VALUES (?, ?, ?)')
		unique.forEach((cardId, slot) => insert.run(teamId, slot, cardId))
	})
	replace()

	return { ok: true, team: getTeam(userId, teamId)! }
}

export function getActiveTeamId(userId: string): string | null {
	const row = db.prepare('SELECT active_team_id FROM users WHERE id = ?').get(userId) as
		| { active_team_id: string | null }
		| undefined
	return row?.active_team_id ?? null
}

export function setActiveTeam(userId: string, teamId: string | null): boolean {
	if (teamId !== null && !getTeam(userId, teamId)) return false
	db.prepare('UPDATE users SET active_team_id = ? WHERE id = ?').run(teamId, userId)
	return true
}
