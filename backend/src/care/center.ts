import { db } from '../db'
import { getActiveTeamId, getTeam, type TeamMember } from '../teams/teams'
import { getMap, positionOf } from '../world/world'
import { admit, careDuration, settleCare, HEAL_UNIT_MS, type AdmitResult } from './healing'

/**
 * The healing centre, as a place on the map.
 *
 * The same rule as the training camps: you have to be standing there. The
 * position is read from the world the server itself simulates, so leaving your
 * team to mend is something you walk to rather than something you request.
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
	/** The active team, each member with its condition. */
	members: TeamMember[]
	/** Members that are hurt and not yet being treated. */
	wounded: TeamMember[]
	/** Members currently being treated. */
	inCare: TeamMember[]
	/** One unit of care, so the panel can explain the wait without guessing. */
	unitMs: number
	/** What each wounded member would cost in time, keyed by card. */
	estimates: Record<string, number>
}

export function careState(userId: string): CareState {
	settleCare(userId)

	const teamId = getActiveTeamId(userId)
	const team = teamId ? getTeam(userId, teamId) : null
	const members = team?.members ?? []

	const where = site()
	const standing = positionOf(userId)

	const wounded = members.filter((member) => !member.inCare && member.health < 1)
	const estimates: Record<string, number> = {}
	for (const member of wounded) {
		estimates[member.cardId] = careDuration(member.rarity as never, 1 - member.health)
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
	}
}

export type AdmitOutcome =
	| { ok: true; result: AdmitResult }
	| { ok: false; reason: 'NO_CENTER' | 'TOO_FAR' | 'NOTHING_TO_TREAT' | 'NOT_OWNED' }

/**
 * Hand cards over for treatment.
 *
 * With no list, the whole active team's wounded are taken in — which is what
 * the button in the panel does. An explicit list is still honoured, and every
 * id in it is checked against what the player actually owns.
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

	const result = admit(userId, ids)
	if (result.admitted.length === 0) return { ok: false, reason: 'NOTHING_TO_TREAT' }
	return { ok: true, result }
}
