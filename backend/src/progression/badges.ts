import { db } from '../db'
import { MASTERS, type Master } from '../arena/masters'
import { CAMPS } from '../training/camps'
import { MAX_LEVEL } from './levels'

/**
 * Badges: what beating a master is actually worth.
 *
 * There is no badge table. A badge *is* a row in `master_victories` — the one
 * the arena already writes the first time a master goes down — so a badge can
 * never disagree with the victory that earned it, and nothing has to be
 * backfilled for players who were already winning.
 *
 * What a badge does is open the next training camp, and with it the next band
 * of levels. That is the point of the system: the ceiling on a Pokémon is
 * bought in the arena, not ground out in a field. Before it, a team could walk
 * to level 100 without ever meeting a master, and the ladder had two halves
 * that never spoke to each other.
 *
 * Each badge also unlocks its pin at the barber — see `appearance/appearance`.
 */

/** Badges in the order they are won, which is the masters' tier order. */
export const BADGE_ORDER: Master[] = [...MASTERS].sort((a, b) => a.tier - b.tier)

/** Master ids this account has beaten. */
export function badgesOf(userId: string): string[] {
	const rows = db
		.prepare('SELECT master_id FROM master_victories WHERE user_id = ?')
		.all(userId) as { master_id: string }[]
	return rows.map((row) => row.master_id)
}

export function badgeCount(userId: string): number {
	const row = db
		.prepare('SELECT COUNT(*) AS count FROM master_victories WHERE user_id = ?')
		.get(userId) as { count: number }
	return row.count
}

/** The pins this account may wear: one per badge earned, plus 0 for none. */
export function pinsOf(userId: string): number[] {
	const earned = new Set(badgesOf(userId))
	return [0, ...BADGE_ORDER.filter((master) => earned.has(master.id)).map((master) => master.badge.pin)]
}

/**
 * The highest level any of this account's Pokémon can currently be trained to.
 *
 * Read off the camps rather than invented here: a camp carries a Pokémon one
 * level past its own band, so the cap is simply the ceiling of the last camp
 * the player has the badges for. One number, one rule, and the training panel
 * can explain it with the camp list it already shows.
 */
export function levelCapForBadges(badges: number): number {
	const open = CAMPS.filter((camp) => camp.badges <= badges)
	const top = open.reduce((high, camp) => Math.max(high, camp.maxLevel), 0)
	return Math.min(MAX_LEVEL, top + 1)
}

export function levelCapOf(userId: string): number {
	return levelCapForBadges(badgeCount(userId))
}

/** Badges still needed before the cap moves again, or null at the ceiling. */
export function nextCampFor(badges: number): { name: string; badges: number } | null {
	const next = CAMPS.find((camp) => camp.badges > badges)
	return next ? { name: next.name, badges: next.badges } : null
}
