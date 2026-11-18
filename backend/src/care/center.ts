import { db } from '../db'
import { levelCapOf } from '../progression/badges'
import { progressOf } from '../progression/levels'
import { mentorFactor, mentorsAmong, type Mentor } from '../progression/mentors'
import { listTeams, type TeamMember } from '../teams/teams'
import { getMap, positionOf } from '../world/world'
import { admit, careDuration, settleCare, HEAL_UNIT_MS, conditionOf, type AdmitResult } from './healing'

/**
 * The healing centre, as a place on the map.
 *
 * The same rule as the training camps: you have to be standing there. The
 * position is read from the world the server itself simulates, so leaving your
 * team to mend is something you walk to rather than something you request.
 *
 * The counter takes **everything the account owns**, not just the active
 * team: a player who fought with a second roster, or who benched a wounded
 * card afterwards, would otherwise have no way to mend it at all.
 */

/** How close to the centre's tile the player must stand, in tiles. */
const ENTRY_RANGE = 2

function site(): { x: number; y: number } | null {
	return getMap().centers[0] ?? null
}

export interface CareState {
	/** Where the centre stands, for the panel to point at. */
	at: { x: number; y: number } | null
	/** True when the player is close enough to hand the team over. */
	atCounter: boolean
	/** Every card the centre can look at, each with its condition. */
	members: TeamMember[]
	/** Members that are hurt and not yet being treated. */
	wounded: TeamMember[]
	/** Members currently being treated. */
	inCare: TeamMember[]
	/** One unit of care, so the panel can explain the wait without guessing. */
	unitMs: number
	/** What each wounded member would cost in time, keyed by card. */
	estimates: Record<string, number>
	/**
	 * Mates at the account's level cap: they shorten everyone else's stay.
	 *
	 * The centre has no camp to read a ceiling off, so the tier in play is the
	 * account's own cap — the level its badges allow. See
	 * `progression/mentors.ts`; the training panel applies the same factor to
	 * experience. Mentoring happens inside a team, so a card in two rosters
	 * keeps the best of them; the list here is the union, for the panel's
	 * explanation.
	 */
	mentors: Mentor[]
	/** How much the mentors divide each wounded member's wait by, keyed by card. */
	relief: Record<string, number>
	/** The teams each card belongs to, keyed by card, for the panel's labels. */
	teams: Record<string, string[]>
}

interface LooseRow {
	id: string
	pokedex_id: number
	name: string
	rarity: string
	xp: number
	hp_lost: number
	healed_at: number | null
}

/**
 * Cards that belong to no team but still need the centre.
 *
 * A card benched after a fight keeps its wounds, and nothing else in the app
 * would ever hand it over. Only the ones with something to settle are
 * listed — the collection at large has no business on this panel.
 */
function strayPatients(userId: string): TeamMember[] {
	const rows = db
		.prepare(
			`SELECT c.id, c.pokedex_id, c.name, c.rarity, c.xp, c.hp_lost, c.healed_at
			 FROM cards c
			 WHERE c.user_id = ?
			   AND (c.hp_lost > 0 OR c.healed_at IS NOT NULL)
			   AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.card_id = c.id)
			 ORDER BY c.obtained_at DESC`,
		)
		.all(userId) as LooseRow[]

	return rows.map((row) => ({
		cardId: row.id,
		pokedexId: row.pokedex_id,
		name: row.name,
		rarity: row.rarity,
		// No roster, no slot: the panel orders these by itself.
		slot: -1,
		...progressOf(row.xp),
		...conditionOf(row.hp_lost, row.healed_at),
	}))
}

export function careState(userId: string): CareState {
	settleCare(userId)

	const cap = levelCapOf(userId)
	const byCard = new Map<string, TeamMember>()
	const teamsOf: Record<string, string[]> = {}
	const factors: Record<string, number> = {}
	const mentors: Mentor[] = []
	const seenMentor = new Set<string>()

	for (const team of listTeams(userId)) {
		// Mentoring is a thing that happens inside a roster: a card is nursed
		// by the mates standing next to it, not by the whole collection.
		const teamMentors = mentorsAmong(team.members, cap)
		for (const mentor of teamMentors) {
			if (seenMentor.has(mentor.cardId)) continue
			seenMentor.add(mentor.cardId)
			mentors.push(mentor)
		}

		for (const member of team.members) {
			if (!byCard.has(member.cardId)) byCard.set(member.cardId, member)
			;(teamsOf[member.cardId] ??= []).push(team.name)
			// In several teams: the best bed on offer is the one promised.
			factors[member.cardId] = Math.max(
				factors[member.cardId] ?? 1,
				mentorFactor(member.level, teamMentors),
			)
		}
	}

	for (const stray of strayPatients(userId)) {
		if (byCard.has(stray.cardId)) continue
		byCard.set(stray.cardId, stray)
		factors[stray.cardId] = 1
	}

	const members = [...byCard.values()]
	const where = site()
	const standing = positionOf(userId)

	const wounded = members.filter((member) => !member.inCare && member.health < 1)
	const estimates: Record<string, number> = {}
	const relief: Record<string, number> = {}
	for (const member of wounded) {
		const factor = factors[member.cardId] ?? 1
		if (factor > 1) relief[member.cardId] = factor
		estimates[member.cardId] = careDuration(
			member.rarity as never,
			1 - member.health,
			member.level,
			factor,
		)
	}

	return {
		at: where,
		atCounter:
			where !== null &&
			standing !== null &&
			Math.abs(standing.x - where.x) <= ENTRY_RANGE &&
			Math.abs(standing.y - where.y) <= ENTRY_RANGE,
		members,
		wounded,
		inCare: members.filter((member) => member.inCare),
		unitMs: HEAL_UNIT_MS,
		estimates,
		mentors,
		relief,
		teams: teamsOf,
	}
}

export type AdmitOutcome =
	| { ok: true; result: AdmitResult }
	| { ok: false; reason: 'NO_CENTER' | 'TOO_FAR' | 'NOTHING_TO_TREAT' | 'NOT_OWNED' }

/**
 * Hand cards over for treatment.
 *
 * With no list, every wounded card the account owns is taken in — which is
 * what the button in the panel does. An explicit list is still honoured, and
 * every id in it is checked against what the player actually owns.
 */
export function admitCards(userId: string, cardIds?: string[]): AdmitOutcome {
	const state = careState(userId)
	if (!state.at) return { ok: false, reason: 'NO_CENTER' }
	if (!state.atCounter) return { ok: false, reason: 'TOO_FAR' }

	let ids = cardIds
	if (ids === undefined) {
		ids = state.wounded.map((member) => member.cardId)
	} else if (ids.length > 0) {
		const placeholders = ids.map(() => '?').join(', ')
		const owned = db
			.prepare(`SELECT COUNT(*) AS c FROM cards WHERE user_id = ? AND id IN (${placeholders})`)
			.get(userId, ...ids) as { c: number }
		// A card the player does not own cannot be admitted, whatever is sent.
		if (owned.c !== new Set(ids).size) return { ok: false, reason: 'NOT_OWNED' }
	}

	if (ids.length === 0) return { ok: false, reason: 'NOTHING_TO_TREAT' }

	// The same discount the estimate was shown with, card by card, so the bed
	// the player was promised is the bed they get.
	const relief: Record<string, number> = {}
	for (const id of ids) relief[id] = state.relief[id] ?? 1

	const result = admit(userId, ids, relief)
	if (result.admitted.length === 0) return { ok: false, reason: 'NOTHING_TO_TREAT' }
	return { ok: true, result }
}
