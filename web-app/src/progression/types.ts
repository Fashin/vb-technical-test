/**
 * Progression, as the server reports it.
 *
 * Mirrored from `backend/src/progression/levels.ts`. These shapes travel over
 * three different channels — the training REST route, a duel's socket payload
 * and the card listings — so they belong to the progression module rather than
 * to whichever feature happened to need them first.
 */

export interface Progress {
	level: number
	xp: number
	/** Experience still owed before the next level, 0 at the cap. */
	toNextLevel: number
	/** 0..1 inside the current level, for a progress bar. */
	ratio: number
}

/** What one Pokémon took from a fight. */
export interface XpGain {
	cardId: string
	name: string
	before: Progress
	after: Progress
	/** What was actually credited — 0 once a camp's ceiling is reached. */
	gained: number
}
