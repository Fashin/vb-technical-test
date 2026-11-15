import { db } from '../db'

/**
 * Levels and experience.
 *
 * One curve, used everywhere: a card stores nothing but its total experience
 * and its level is derived from it. Storing the level too would mean two
 * numbers that can disagree, and the level is the cheap one to recompute.
 *
 * `xpForLevel` is quadratic rather than the games' cubic curve. The cost of a
 * level is then `30 · L`, which is close to one won training fight whatever the
 * level — the ladder stays the same length at the bottom and at the top, which
 * is what this project wants: five camps that each take about as long.
 */

export const MAX_LEVEL = 100

/** A card starts here: level 1 would make a fresh booster unusable. */
export const STARTING_LEVEL = 5

/** Total experience needed to *reach* `level`. */
export function xpForLevel(level: number): number {
	const capped = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)))
	return 15 * (capped - 1) * capped
}

/** The level a total of `xp` buys. Inverse of `xpForLevel`, solved, not searched. */
export function levelFromXp(xp: number): number {
	if (xp <= 0) return 1
	const level = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 15)) / 2)
	return Math.min(MAX_LEVEL, Math.max(1, level))
}

export interface Progress {
	level: number
	xp: number
	/** Experience still owed before the next level, 0 at the cap. */
	toNextLevel: number
	/** 0..1 inside the current level, for a progress bar. */
	ratio: number
}

export function progressOf(xp: number): Progress {
	const level = levelFromXp(xp)
	if (level >= MAX_LEVEL) return { level, xp, toNextLevel: 0, ratio: 1 }

	const floor = xpForLevel(level)
	const ceiling = xpForLevel(level + 1)
	return {
		level,
		xp,
		toNextLevel: ceiling - xp,
		ratio: (xp - floor) / (ceiling - floor),
	}
}

/** Experience a fight against a Pokemon of this level is worth. */
export function xpReward(level: number): number {
	return 25 * Math.max(1, Math.round(level)) + 50
}

export interface XpGain {
	cardId: string
	name: string
	before: Progress
	after: Progress
	/** What was actually credited — 0 once the camp's ceiling is reached. */
	gained: number
}

/** What one card earned, before the ceiling is applied. */
export interface XpAward {
	cardId: string
	amount: number
}

/**
 * Credit experience to several cards at once, each its own share.
 *
 * Shares differ because experience is earned, not shared out: a card is paid
 * for the Pokemon it personally knocked out, so the one that sat on the bench
 * is simply not in this list.
 *
 * `ceiling` is the level past which this source teaches nothing: a card
 * already at or above it gains zero, and one below it is never pushed past it.
 * That is the whole gating rule of the training camps, kept here rather than
 * in the camp code so that no caller can forget to apply it.
 *
 * All of it in one transaction: a half-credited team after a crash would be a
 * silent loss of progress.
 */
export function grantXp(awards: XpAward[], ceiling = MAX_LEVEL): XpGain[] {
	const earned = awards.filter((award) => award.amount > 0)
	if (earned.length === 0) return []

	const placeholders = earned.map(() => '?').join(', ')
	const rows = db
		.prepare(`SELECT id, name, xp FROM cards WHERE id IN (${placeholders})`)
		.all(...earned.map((award) => award.cardId)) as { id: string; name: string; xp: number }[]

	const amounts = new Map(earned.map((award) => [award.cardId, award.amount]))
	const capXp = xpForLevel(Math.min(MAX_LEVEL, ceiling))
	const update = db.prepare('UPDATE cards SET xp = ? WHERE id = ?')

	const apply = db.transaction((): XpGain[] =>
		rows.map((row) => {
			const before = progressOf(row.xp)
			const amount = amounts.get(row.id) ?? 0
			// Already past what this camp can teach: nothing is credited at all.
			const next = row.xp >= capXp ? row.xp : Math.min(capXp, row.xp + amount)
			if (next !== row.xp) update.run(next, row.id)

			return {
				cardId: row.id,
				name: row.name,
				before,
				after: progressOf(next),
				gained: next - row.xp,
			}
		}),
	)

	return apply()
}
