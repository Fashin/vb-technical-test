import { randomUUID } from 'crypto'

import { db } from '../db'
import { findById, type UserRow } from '../auth/users'
import { fetchCardFace, fetchFighter } from '../services/pokeapi'
import { conditionOf, settleCare, type Condition } from '../care/healing'
import { progressOf, STARTING_LEVEL, xpForLevel } from '../progression/levels'
import { pickFrom, rollRarity, type Rarity } from './rarity'
import { luckyStock, shardsOf, spendLucky, type LuckyStock } from './recycle'

/**
 * Booster economy.
 *
 * Time is counted on the server and nowhere else: a client that lies about the
 * clock gains nothing, and packs keep accruing while the player is logged out.
 * The accrual is a pure function of `booster_since`, so there is no timer, no
 * cron, and nothing to replay after a restart.
 */

/** One pack every ten minutes, overridable for demos. */
export const BOOSTER_INTERVAL_MS = Number(process.env.BOOSTER_INTERVAL_MS) || 10 * 60 * 1000

/**
 * Accrual stops here, so a month offline does not hand out a hundred packs.
 *
 * The arena's reward caps against this same number — see `creditVictory` in
 * `battle/battles.ts`. Raising it in one place and not the other would let a
 * win either overflow the ceiling or be quietly clipped below it.
 */
export const MAX_PENDING = 7

export const CARDS_PER_BOOSTER = 5

export interface BoosterState {
	pending: number
	max: number
	intervalMs: number
	cardsPerBooster: number
	/**
	 * Delay until the next pack, or null when the stock is already full.
	 *
	 * Relative on purpose, never an absolute timestamp: the client would have
	 * to compare it against its own clock, and a browser whose clock is ahead
	 * of this server by more than one interval would see every countdown as
	 * already expired.
	 */
	nextInMs: number | null
	/**
	 * Packs minted from recycled duplicates, best luck first — a stock of their
	 * own, deliberately outside `max`: these were paid for with cards, so there
	 * is nothing to stop accruing and nothing to cap.
	 */
	lucky: LuckyStock[]
	/** Recycling shards not yet worth a whole pack. */
	shards: number
}

export interface DrawnCard extends Condition {
	id: string
	pokedexId: number
	name: string
	rarity: Rarity
	obtainedAt: number
	/** Lowercase PokeAPI type names, in slot order. Empty if the lookup failed. */
	types: string[]
	/** The four stats the brief asks a card to show. Null if the lookup failed. */
	stats: { hp: number; attack: number; defense: number; speed: number } | null
	/** Derived from the card's experience — see `progression/levels.ts`. */
	level: number
	xp: number
	toNextLevel: number
	ratio: number
}

/**
 * Hand out whatever the passage of time owes this user, then report the state.
 *
 * The leftover time is kept: claiming at 14'59" does not reset the clock, so
 * nobody is punished for checking in often.
 */
export function accrue(user: UserRow): BoosterState {
	const now = Date.now()
	let pending = user.boosters_pending
	// `0` means the clock has never started (a row from before this feature):
	// start it now rather than crediting decades of elapsed time.
	const since = user.booster_since || now

	let earned = Math.floor((now - since) / BOOSTER_INTERVAL_MS)
	let nextSince = since + earned * BOOSTER_INTERVAL_MS

	if (earned > 0 || since !== user.booster_since) {
		if (pending + earned > MAX_PENDING) {
			earned = MAX_PENDING - pending
			// Full: the clock restarts from now, it does not bank the overflow.
			nextSince = now
		}
		pending += earned
		db.prepare('UPDATE users SET boosters_pending = ?, booster_since = ? WHERE id = ?').run(
			pending,
			nextSince,
			user.id,
		)
	}

	// The recycled stock and the shard balance travel with the timed one: every
	// screen that shows "what can I open right now" needs all three, and one
	// shape means no screen can show two of them and forget the third.
	const fromDuplicates = { lucky: luckyStock(user.id), shards: shardsOf(user.id) }

	if (pending >= MAX_PENDING) {
		return {
			pending,
			max: MAX_PENDING,
			intervalMs: BOOSTER_INTERVAL_MS,
			cardsPerBooster: CARDS_PER_BOOSTER,
			nextInMs: null,
			...fromDuplicates,
		}
	}

	return {
		pending,
		max: MAX_PENDING,
		intervalMs: BOOSTER_INTERVAL_MS,
		cardsPerBooster: CARDS_PER_BOOSTER,
		nextInMs: nextSince + BOOSTER_INTERVAL_MS - now,
		...fromDuplicates,
	}
}

export function getState(userId: string): BoosterState | null {
	const user = findById(userId)
	return user ? accrue(user) : null
}

/**
 * Draw a pack's worth of cards and file them in the collection.
 *
 * `luck` shifts the odds of every slot by that many percentage points — 0 for
 * the packs time hands out, more for the ones bought with duplicates. It is
 * the only difference between the two: a lucky pack is a pack, same five
 * cards, same guaranteed slot, better table.
 */
async function drawPack(userId: string, luck: number): Promise<DrawnCard[]> {
	const draws = Array.from({ length: CARDS_PER_BOOSTER }, (_, index) => {
		// The last slot is the guaranteed one, so a pack is never five commons.
		const rarity = rollRarity(index === CARDS_PER_BOOSTER - 1, luck)
		return { rarity, pokedexId: pickFrom(rarity) }
	})

	const named = await Promise.all(
		draws.map(async (draw) => ({ ...draw, name: await fetchCardFace(draw.pokedexId) })),
	)

	const now = Date.now()
	// A card is drawn trained enough to be worth fielding: at level 1 a fresh
	// booster could not survive the first camp, let alone the first master.
	const startingXp = xpForLevel(STARTING_LEVEL)

	const cards: DrawnCard[] = named.map((draw) => ({
		id: randomUUID(),
		pokedexId: draw.pokedexId,
		name: draw.name,
		rarity: draw.rarity,
		obtainedAt: now,
		types: [],
		stats: null,
		...progressOf(startingXp),
		// A card comes out of its wrapper in perfect health.
		...conditionOf(0, null),
	}))

	const insert = db.prepare(
		'INSERT INTO cards (id, user_id, pokedex_id, name, rarity, obtained_at, xp) VALUES (?, ?, ?, ?, ?, ?, ?)',
	)
	db.transaction(() => {
		for (const card of cards) {
			insert.run(card.id, userId, card.pokedexId, card.name, card.rarity, card.obtainedAt, startingXp)
		}
	})()

	return cards
}

export interface OpenedBooster {
	cards: DrawnCard[]
	state: BoosterState
	/** Bonus the pack was drawn with, in percentage points. 0 for a timed one. */
	luck: number
}

/**
 * Open one pack. Returns null when there is nothing to open — the check and
 * the decrement happen in one transaction, so two clicks cannot spend one pack
 * twice.
 */
export async function openBooster(userId: string): Promise<OpenedBooster | null> {
	const user = findById(userId)
	if (!user) return null

	accrue(user)

	const spend = db.transaction((id: string) => {
		const row = db.prepare('SELECT boosters_pending AS pending FROM users WHERE id = ?').get(id) as
			| { pending: number }
			| undefined
		if (!row || row.pending <= 0) return false

		const wasFull = row.pending >= MAX_PENDING
		db.prepare('UPDATE users SET boosters_pending = boosters_pending - 1 WHERE id = ?').run(id)
		// Coming down from a full stock restarts the clock, which was parked.
		if (wasFull) db.prepare('UPDATE users SET booster_since = ? WHERE id = ?').run(Date.now(), id)
		return true
	})

	if (!spend(userId)) return null

	const cards = await drawPack(userId, 0)
	return { cards, state: getState(userId)!, luck: 0 }
}

/**
 * Open the best pack the player's recycled duplicates bought.
 *
 * The pack is spent before it is drawn, and the stock is its own table, so
 * this never touches the timed accrual: emptying the lucky stock does not
 * restart the ten-minute clock, and a full timed stock does not block it.
 */
export async function openLuckyBooster(userId: string): Promise<OpenedBooster | null> {
	const user = findById(userId)
	if (!user) return null

	const luck = spendLucky(userId)
	if (luck === null) return null

	const cards = await drawPack(userId, luck)
	return { cards, state: getState(userId)!, luck }
}

/**
 * Types and base stats for a set of species, from PokeAPI's cache.
 *
 * `fetchFighter` keeps one entry per species for the life of the process, so
 * this costs one round trip per *new* species and nothing afterwards. A lookup
 * that fails leaves the card without them rather than failing the whole
 * listing: a collection that will not load because PokeAPI hiccuped would be a
 * poor trade for a filter.
 */
async function speciesDetails(pokedexIds: number[]) {
	const details = new Map<number, { types: string[]; stats: DrawnCard['stats'] }>()

	await Promise.all(
		[...new Set(pokedexIds)].map(async (pokedexId) => {
			try {
				const fighter = await fetchFighter(pokedexId)
				details.set(pokedexId, {
					types: fighter.types,
					stats: {
						hp: fighter.stats.hp,
						attack: fighter.stats.attack,
						defense: fighter.stats.defense,
						speed: fighter.stats.speed,
					},
				})
			} catch {
				details.set(pokedexId, { types: [], stats: null })
			}
		}),
	)

	return details
}

/** Everything this user owns, newest first. */
export async function listCards(userId: string): Promise<DrawnCard[]> {
	// Anything whose treatment is over walks out before the list is read.
	settleCare(userId)

	const rows = db
		.prepare(
			`SELECT id, pokedex_id, name, rarity, obtained_at, xp, hp_lost, healed_at
			 FROM cards WHERE user_id = ? ORDER BY obtained_at DESC`,
		)
		.all(userId) as {
		id: string
		pokedex_id: number
		name: string
		rarity: Rarity
		obtained_at: number
		xp: number
		hp_lost: number
		healed_at: number | null
	}[]

	const details = await speciesDetails(rows.map((row) => row.pokedex_id))

	return rows.map((row) => ({
		id: row.id,
		pokedexId: row.pokedex_id,
		name: row.name,
		rarity: row.rarity,
		obtainedAt: row.obtained_at,
		types: details.get(row.pokedex_id)?.types ?? [],
		stats: details.get(row.pokedex_id)?.stats ?? null,
		...progressOf(row.xp),
		...conditionOf(row.hp_lost, row.healed_at),
	}))
}
