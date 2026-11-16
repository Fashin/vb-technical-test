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

/**
 * A team mate that has topped out the tier in play and coaches instead.
 *
 * Mirrored from `backend/src/progression/mentors.ts`. Travels with a training
 * session and with the healing centre's state, because one rule drives both.
 */
export interface Mentor {
	cardId: string
	name: string
	level: number
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
