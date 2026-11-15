import { db } from '../db'
import type { Rarity } from '../boosters/rarity'

/**
 * Wounds, and the time it takes to mend them.
 *
 * Hit points lost in a fight stay lost. A card carries its damage as a
 * **share of its maximum**, not as a number of hit points: the maximum moves
 * every time the card gains a level, and a stored absolute would quietly
 * change meaning underneath. A share also means nothing here needs the
 * Pokedex, so a card's condition can be read without a single API call.
 *
 * Healing is time on the server and nowhere else, exactly like the booster
 * clock: the moment care will finish is computed once, written down, and the
 * cards settle themselves lazily on the next read. No timer, no cron, nothing
 * to replay after a restart — and a client that lies about the clock gains
 * nothing.
 */

/** One unit of care. Overridable so a demo does not have to wait minutes. */
export const HEAL_UNIT_MS = Number(process.env.HEAL_UNIT_MS) || 60_000

/**
 * Units of care a fully spent Pokemon needs, by rarity.
 *
 * The rare ones are the slow ones on purpose: the better the card, the more a
 * defeat costs you in time, and the more it is worth sparing it.
 */
const UNITS: Record<Rarity, number> = {
	common: 5,
	uncommon: 10,
	rare: 20,
	legendary: 40,
}

/** Nobody waits meaningfully for a scratch, but nothing is instant either. */
const MIN_CARE_MS = 20_000

/** How long it takes to mend `share` of a Pokemon's health, in milliseconds. */
export function careDuration(rarity: Rarity, share: number): number {
	const units = UNITS[rarity] ?? UNITS.common
	const clamped = Math.min(1, Math.max(0, share))
	return Math.max(MIN_CARE_MS, Math.round(units * HEAL_UNIT_MS * clamped))
}

/** A card's condition, as every panel in the app shows it. */
export interface Condition {
	/** 0..1 of the maximum still standing. 1 is untouched, 0 is fainted. */
	health: number
	fainted: boolean
	/** When care finishes, or null when the card is not at the centre. */
	healedAt: number | null
	/** True while the card is at the centre and cannot be fielded. */
	inCare: boolean
}

export function conditionOf(hpLost: number, healedAt: number | null): Condition {
	const health = Math.min(1, Math.max(0, 1 - hpLost))
	return {
		health,
		fainted: health <= 0,
		healedAt,
		inCare: healedAt !== null,
	}
}

/**
 * Discharge whatever has finished healing.
 *
 * Called at the top of every read of a user's cards. It is one statement and
 * it is idempotent, which is what lets the rest of the app treat `hp_lost` as
 * simply true rather than "true as of some sweep".
 */
export function settleCare(userId: string): void {
	db.prepare(
		`UPDATE cards SET hp_lost = 0, healed_at = NULL
		 WHERE user_id = ? AND healed_at IS NOT NULL AND healed_at <= ?`,
	).run(userId, Date.now())
}

/** Damage to write back after a fight, as a share of each card's maximum. */
export interface Wound {
	cardId: string
	/** 0..1 of the maximum that is now missing. */
	lost: number
}

/**
 * Record what a fight cost.
 *
 * Only ever worsens a card's state: a card already at the centre is left
 * alone, because it was not on the field in the first place.
 */
export function recordWounds(userId: string, wounds: Wound[]): void {
	if (wounds.length === 0) return

	const update = db.prepare(
		`UPDATE cards SET hp_lost = ? WHERE id = ? AND user_id = ? AND healed_at IS NULL`,
	)

	db.transaction(() => {
		for (const wound of wounds) {
			update.run(Math.min(1, Math.max(0, wound.lost)), wound.cardId, userId)
		}
	})()
}

export interface AdmitResult {
	/** Cards taken in, with the moment each one will be ready. */
	admitted: { cardId: string; name: string; healedAt: number }[]
	/** Cards that needed nothing, or were already being treated. */
	skipped: number
}

/**
 * Take wounded cards into care.
 *
 * The end of the treatment is computed here, from the rarity and from how much
 * was actually lost, and stored as a moment in time. Everything afterwards is
 * a comparison against the clock.
 */
export function admit(userId: string, cardIds: string[]): AdmitResult {
	settleCare(userId)
	if (cardIds.length === 0) return { admitted: [], skipped: 0 }

	const placeholders = cardIds.map(() => '?').join(', ')
	const rows = db
		.prepare(
			`SELECT id, name, rarity, hp_lost, healed_at FROM cards
			 WHERE user_id = ? AND id IN (${placeholders})`,
		)
		.all(userId, ...cardIds) as {
		id: string
		name: string
		rarity: Rarity
		hp_lost: number
		healed_at: number | null
	}[]

	const now = Date.now()
	const admitted: AdmitResult['admitted'] = []
	let skipped = 0

	const update = db.prepare('UPDATE cards SET healed_at = ? WHERE id = ? AND user_id = ?')

	db.transaction(() => {
		for (const row of rows) {
			// Untouched, or already on a bed: nothing to start.
			if (row.hp_lost <= 0 || row.healed_at !== null) {
				skipped++
				continue
			}

			const healedAt = now + careDuration(row.rarity, row.hp_lost)
			update.run(healedAt, row.id, userId)
			admitted.push({ cardId: row.id, name: row.name, healedAt })
		}
	})()

	return { admitted, skipped }
}
