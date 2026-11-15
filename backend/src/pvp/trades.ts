import { randomUUID } from 'crypto'

import { settleCare } from '../care/healing'
import { db } from '../db'
import { progressOf } from '../progression/levels'
import { withinReach } from './encounters'

/**
 * Trades between two players.
 *
 * The session lives in memory while it is open and commits in a single
 * transaction when both sides have confirmed. Two rules make it safe to use:
 *
 *  - **changing an offer clears both confirmations.** Nobody can confirm a
 *    deal and have the other side swap the card underneath afterwards;
 *  - **the server owns the offers.** Every card id is checked against what the
 *    player actually owns, every time, not once when it was offered.
 *
 * Cards being treated at the healing centre cannot be traded: they are not in
 * their owner's hands to give.
 */

/** Cards one side may put on the table at once. */
const MAX_OFFER = 6

export interface TradeCard {
	cardId: string
	pokedexId: number
	name: string
	rarity: string
	level: number
	health: number
}

export interface TradeSide {
	userId: string
	name: string
	offer: TradeCard[]
	confirmed: boolean
}

export interface TradeSession {
	id: string
	sides: [TradeSide, TradeSide]
	/** Set once the swap has gone through; the session is then over. */
	settled: boolean
}

const sessions = new Map<string, TradeSession>()

export function sessionOf(userId: string): TradeSession | null {
	for (const session of sessions.values()) {
		if (session.sides.some((side) => side.userId === userId)) return session
	}
	return null
}

export function open(
	a: { userId: string; name: string },
	b: { userId: string; name: string },
): TradeSession {
	// One table per player: opening a new one closes whatever was left behind.
	for (const player of [a, b]) {
		const stale = sessionOf(player.userId)
		if (stale) sessions.delete(stale.id)
	}

	const session: TradeSession = {
		id: randomUUID(),
		sides: [
			{ userId: a.userId, name: a.name, offer: [], confirmed: false },
			{ userId: b.userId, name: b.name, offer: [], confirmed: false },
		],
		settled: false,
	}
	sessions.set(session.id, session)
	return session
}

export function close(userId: string): TradeSession | null {
	const session = sessionOf(userId)
	if (session) sessions.delete(session.id)
	return session
}

function sideFor(session: TradeSession, userId: string): TradeSide | null {
	return session.sides.find((side) => side.userId === userId) ?? null
}

export function otherSide(session: TradeSession, userId: string): TradeSide {
	return session.sides.find((side) => side.userId !== userId)!
}

/** Read the offered cards back from the database, refusing anything untradeable. */
function readOffer(userId: string, cardIds: string[]): TradeCard[] | null {
	const unique = [...new Set(cardIds)].slice(0, MAX_OFFER)
	if (unique.length === 0) return []

	settleCare(userId)
	const placeholders = unique.map(() => '?').join(', ')
	const rows = db
		.prepare(
			`SELECT id, pokedex_id, name, rarity, xp, hp_lost, healed_at FROM cards
			 WHERE user_id = ? AND id IN (${placeholders})`,
		)
		.all(userId, ...unique) as {
		id: string
		pokedex_id: number
		name: string
		rarity: string
		xp: number
		hp_lost: number
		healed_at: number | null
	}[]

	// A card that is not owned, or is on a bed at the centre, is not on offer.
	if (rows.length !== unique.length) return null
	if (rows.some((row) => row.healed_at !== null)) return null

	return rows.map((row) => ({
		cardId: row.id,
		pokedexId: row.pokedex_id,
		name: row.name,
		rarity: row.rarity,
		level: progressOf(row.xp).level,
		health: Math.min(1, Math.max(0, 1 - row.hp_lost)),
	}))
}

export type OfferResult = { ok: true; session: TradeSession } | { ok: false; reason: 'NO_SESSION' | 'NOT_OWNED' }

/** Put cards on the table. Both confirmations are cleared by any change. */
export function setOffer(userId: string, cardIds: string[]): OfferResult {
	const session = sessionOf(userId)
	const side = session ? sideFor(session, userId) : null
	if (!session || !side || session.settled) return { ok: false, reason: 'NO_SESSION' }

	const offer = readOffer(userId, cardIds)
	if (offer === null) return { ok: false, reason: 'NOT_OWNED' }

	side.offer = offer
	// What was agreed to no longer exists; both sides must look again.
	for (const party of session.sides) party.confirmed = false

	return { ok: true, session }
}

export type ConfirmResult =
	| { ok: true; session: TradeSession; done: boolean }
	| { ok: false; reason: 'NO_SESSION' | 'TOO_FAR' | 'EMPTY' | 'NOT_OWNED' }

/**
 * Confirm, and settle when both have.
 *
 * The offers are read from the database again at the last moment: between the
 * two confirmations a card may have been sent to the healing centre, traded in
 * another window, or simply never have been there.
 */
export function confirm(userId: string, confirmed: boolean): ConfirmResult {
	const session = sessionOf(userId)
	const side = session ? sideFor(session, userId) : null
	if (!session || !side || session.settled) return { ok: false, reason: 'NO_SESSION' }

	const other = otherSide(session, userId)
	if (!withinReach(side.userId, other.userId)) return { ok: false, reason: 'TOO_FAR' }

	side.confirmed = confirmed
	if (!session.sides.every((party) => party.confirmed)) return { ok: true, session, done: false }

	// An empty trade on both sides is a misunderstanding, not a deal.
	if (session.sides.every((party) => party.offer.length === 0)) return { ok: false, reason: 'EMPTY' }

	// Last look before anything moves.
	for (const party of session.sides) {
		const still = readOffer(
			party.userId,
			party.offer.map((card) => card.cardId),
		)
		if (still === null || still.length !== party.offer.length) {
			for (const reset of session.sides) reset.confirmed = false
			return { ok: false, reason: 'NOT_OWNED' }
		}
	}

	settle(session)
	return { ok: true, session, done: true }
}

/**
 * Hand the cards over, both ways, in one transaction.
 *
 * The cards also leave every team they were in: a roster pointing at a card
 * somebody else now owns would field a Pokemon the player does not have.
 */
function settle(session: TradeSession): void {
	const move = db.prepare('UPDATE cards SET user_id = ? WHERE id = ? AND user_id = ?')
	const unteam = db.prepare('DELETE FROM team_members WHERE card_id = ?')
	// Logged in the same transaction as the move: a trade that happened and a
	// trade that was recorded are the same event or neither.
	const log = db.prepare(
		'INSERT INTO trades (id, trade_id, giver_id, taker_id, card_id, traded_at) VALUES (?, ?, ?, ?, ?, ?)',
	)
	const at = Date.now()

	db.transaction(() => {
		for (const side of session.sides) {
			const receiver = otherSide(session, side.userId)
			for (const card of side.offer) {
				unteam.run(card.cardId)
				move.run(receiver.userId, card.cardId, side.userId)
				log.run(randomUUID(), session.id, side.userId, receiver.userId, card.cardId, at)
			}
		}
	})()

	session.settled = true
	sessions.delete(session.id)
}
