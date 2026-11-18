import { db } from '../db'
import { RANKING_ORDER, RANKING_SCORES } from './order'

/**
 * The podium crowns.
 *
 * Indexes into the web app's `CROWN_STYLES`: gold for whoever leads the
 * ranking, iron for the runner-up, bronze for third. 0 is "no crown".
 *
 * They are the one reward that can be *lost*: every other unlock records
 * something the account did once and keeps forever, while a crown says who is
 * ahead right now. So nothing is granted and nothing is revoked by hand —
 * `crownFor` asks the ranking, the appearance save refuses a crown the
 * account is not entitled to, and `appearanceOf` drops one that has stopped
 * being true. A player who falls off the podium loses the crown without any
 * write path having to remember to take it off them.
 */
export const CROWN_GOLD = 1
export const CROWN_IRON = 2
export const CROWN_BRONZE = 3

/** How many crowns there are, podium-shaped. */
export const CROWNS = [CROWN_GOLD, CROWN_IRON, CROWN_BRONZE]

/** What unlocks each crown, in words — the messages the save refuses with. */
export const CROWN_REQUIREMENTS: Record<number, string> = {
	[CROWN_GOLD]: 'La couronne d’or est réservée au premier du classement',
	[CROWN_IRON]: 'La couronne de fer est réservée au deuxième du classement',
	[CROWN_BRONZE]: 'La couronne de bronze est réservée au troisième du classement',
}

/**
 * The podium, best first — at most three account ids.
 *
 * Cached for a moment because `appearanceOf` runs it: drawing the whole
 * leaderboard asks for every row's look, and that would otherwise be one
 * podium query per trainer listed. A few seconds stale is invisible on a
 * standing that moves when a master is beaten, and nothing but a cosmetic
 * hangs on it.
 */
const PODIUM_TTL = 5_000

let podiumIds: string[] = []
let podiumAt = 0

export function podium(): string[] {
	const now = Date.now()
	if (now - podiumAt < PODIUM_TTL) return podiumIds

	const rows = db
		.prepare(
			`SELECT u.id, ${RANKING_SCORES}
			 FROM users u
			 ${RANKING_ORDER}
			 LIMIT ${CROWNS.length}`,
		)
		.all() as { id: string }[]

	podiumIds = rows.map((row) => row.id)
	podiumAt = now
	return podiumIds
}

/** Forget the cached podium — for the tests, and after a wipe. */
export function resetPodium(): void {
	podiumIds = []
	podiumAt = 0
}

/**
 * The crown this account is entitled to right now, 0 for none.
 *
 * One crown per place: the leader's is gold and nobody else's is.
 */
export function crownFor(userId: string): number {
	const place = podium().indexOf(userId)
	return place === -1 ? 0 : CROWNS[place]
}
