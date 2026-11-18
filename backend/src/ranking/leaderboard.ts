import { MASTERS } from '../arena/masters'
import { appearanceOf } from '../auth/users'
import type { Appearance } from '../appearance/appearance'
import { DEX_TOTAL } from '../boosters/rarity'
import { db } from '../db'
import { levelFromXp } from '../progression/levels'
import { CAMPS } from '../training/camps'
import { listPlayers } from '../world/world'
import { RANKING_ORDER, RANKING_SCORES } from './order'

/**
 * The trainer ranking.
 *
 * Everything shown here is counted from the tables that already hold the
 * truth — victories, cards, experience — rather than from a score column kept
 * up to date by hand. A standing that is derived cannot drift from what the
 * player actually did, and no write path has to remember to update it.
 *
 * The ladder's order is the arena: masters beaten first, because that is the
 * one thing you cannot buy with time. The Pokedex breaks ties, and raw
 * experience breaks what is left. It lives in `order.ts`, shared with the
 * podium crowns so the standing and the crowns can never disagree.
 */

export interface RankedTrainer {
	userId: string
	rank: number
	name: string
	spriteId: number
	appearance: Appearance
	/** Masters beaten, out of the whole arena roster. */
	masters: number
	mastersTotal: number
	/** Distinct Pokemon owned, against everything the boosters can give. */
	dexOwned: number
	dexTotal: number
	dexPercent: number
	/** Cards held, duplicates included — how much has been opened. */
	cards: number
	/** The best-trained Pokemon, and the camp that level belongs to. */
	bestLevel: number
	band: string | null
	/** Duels won against other trainers. */
	duels: number
	/** Pokemon at the healing centre right now: who is pushing hard. */
	inCare: number
	online: boolean
	lastSeenAt: number
}

interface Row {
	id: string
	display_name: string
	sprite_id: number
	appearance: string
	last_seen_at: number
	masters: number
	dex_owned: number
	cards: number
	best_xp: number
	duels: number
	in_care: number
}

/** The training camp a level belongs to, as a label for the ranking. */
function bandOf(level: number): string | null {
	if (level <= 0) return null
	const camp = CAMPS.find((entry) => level >= entry.minLevel && level <= entry.maxLevel)
	return (camp ?? CAMPS[CAMPS.length - 1]).name
}

/**
 * Every trainer, best first.
 *
 * One query with correlated sub-counts rather than a join and a group-by: the
 * population here is small, and this keeps each number next to the question it
 * answers.
 */
export function leaderboard(): RankedTrainer[] {
	const rows = db
		.prepare(
			`SELECT u.id, u.display_name, u.sprite_id, u.appearance, u.last_seen_at,
			        ${RANKING_SCORES},
			        (SELECT COUNT(*) FROM cards c WHERE c.user_id = u.id)                       AS cards,
			        (SELECT COUNT(*) FROM cards c WHERE c.user_id = u.id AND c.healed_at IS NOT NULL) AS in_care
			 FROM users u
			 ${RANKING_ORDER}`,
		)
		.all() as Row[]

	const connected = new Set(listPlayers().map((player) => player.userId))

	return rows.map((row, index) => {
		const bestLevel = levelFromXp(row.best_xp)

		return {
			userId: row.id,
			rank: index + 1,
			name: row.display_name,
			spriteId: row.sprite_id,
			appearance: appearanceOf({ id: row.id, appearance: row.appearance } as never),
			masters: row.masters,
			mastersTotal: MASTERS.length,
			dexOwned: row.dex_owned,
			dexTotal: DEX_TOTAL,
			dexPercent: Math.round((row.dex_owned / DEX_TOTAL) * 100),
			cards: row.cards,
			duels: row.duels,
			// A trainer with no cards at all has no best Pokemon, not a level 1 one.
			bestLevel: row.cards > 0 ? bestLevel : 0,
			band: row.cards > 0 ? bandOf(bestLevel) : null,
			inCare: row.in_care,
			online: connected.has(row.id),
			lastSeenAt: row.last_seen_at,
		}
	})
}
