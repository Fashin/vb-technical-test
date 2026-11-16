import { db } from '../db'
import { STARTING_LEVEL, levelFromXp } from '../progression/levels'
import { MAX_LUCK, clampLuck, oddsFor, type Rarity } from './rarity'

/**
 * Turning duplicates into luck.
 *
 * A collection fills up with copies nobody will ever field: the fourth
 * Rattata the packs handed out, still at the level it came out of its wrapper
 * at. This gives them a use — they are melted into shards, and shards buy
 * packs that draw on better odds than the ones time hands out for free.
 *
 * The three rules that make it safe to click:
 *
 *  - **never the last copy.** One copy of every species stays, whatever the
 *    stock, so the Pokedex can only ever go up. The copy that stays is the
 *    best-trained one — the one the player would actually field.
 *  - **never a trained card.** Only cards still at `STARTING_LEVEL` are taken.
 *    A level the player paid camps for is work, and work is not a duplicate.
 *  - **never a legendary, never a card in use.** Legendaries are out of the
 *    deal entirely, as are cards sitting in a team or at the healing centre.
 *
 * Everything the client is shown comes from `eligible`, and the transformation
 * re-reads it inside its own transaction: a preview can go stale (a camp, a
 * trade, a second tab) and what is destroyed must be what the rules allow at
 * that instant, not what the preview happened to say.
 */

/** What one recycled card is worth, by rarity. Legendaries are never taken. */
export const SHARD_VALUE: Record<Exclude<Rarity, 'legendary'>, number> = {
	common: 1,
	uncommon: 2,
	rare: 5,
}

/**
 * Shards for one pack — the brief's "ten commons for a pack", spelled out.
 *
 * Rarity therefore pays twice: a rare is five commons' worth of packs, and it
 * also pulls the batch's average up, which is what sets the luck below.
 */
export const SHARDS_PER_BOOSTER = 10

export type RecyclableRarity = keyof typeof SHARD_VALUE

export interface RecycleCandidate {
	cardId: string
	pokedexId: number
	name: string
	rarity: RecyclableRarity
	obtainedAt: number
}

export interface RecyclePreview {
	/** Every card the button would consume, so the panel can show them. */
	candidates: RecycleCandidate[]
	byRarity: Record<RecyclableRarity, number>
	/** Shards these cards are worth, before the leftovers are added in. */
	shards: number
	/** Shards left over from earlier transformations, which join this batch. */
	carried: number
	/** Packs the batch would mint, and what each of them would be worth. */
	boosters: number
	luck: number
	/** Shards that would be left waiting for the next batch. */
	remainder: number
}

export interface LuckyStock {
	luck: number
	count: number
}

interface CardRow {
	id: string
	pokedex_id: number
	name: string
	rarity: Rarity
	xp: number
	obtained_at: number
	in_team: number
	healed_at: number | null
}

/**
 * The luck a batch buys, in percentage points.
 *
 * The *average* value of what was melted, not the total: quality decides how
 * good the packs are and quantity decides how many there are. Ten commons
 * give +1 %, which is the rule the feature was asked for; a pile of rares
 * gives +3 %, the ceiling in `rarity.ts`. Rounded rather than floored so a
 * batch that is mostly uncommons is not quietly treated as commons.
 */
export function luckFor(shards: number, cards: number): number {
	if (cards <= 0 || shards <= 0) return 0
	return clampLuck(Math.max(1, Math.round(shards / cards)))
}

export function shardsOf(userId: string): number {
	const row = db.prepare('SELECT shards FROM users WHERE id = ?').get(userId) as { shards: number } | undefined
	return row?.shards ?? 0
}

/** Lucky packs waiting, best first — the order they are opened in. */
export function luckyStock(userId: string): LuckyStock[] {
	return db
		.prepare('SELECT luck, count FROM lucky_boosters WHERE user_id = ? AND count > 0 ORDER BY luck DESC')
		.all(userId) as LuckyStock[]
}

/**
 * The cards the three rules leave standing.
 *
 * Grouped per species in JS rather than in SQL: "all of them but the best one"
 * is a window function away in SQLite, and the readable version is right here
 * where the rules are documented.
 */
export function candidatesFor(userId: string): RecycleCandidate[] {
	const rows = db
		.prepare(
			`SELECT c.id, c.pokedex_id, c.name, c.rarity, c.xp, c.obtained_at, c.healed_at,
			        EXISTS (SELECT 1 FROM team_members m WHERE m.card_id = c.id) AS in_team
			 FROM cards c
			 WHERE c.user_id = ?`,
		)
		.all(userId) as CardRow[]

	const byPokemon = new Map<number, CardRow[]>()
	for (const row of rows) {
		const group = byPokemon.get(row.pokedex_id)
		if (group) group.push(row)
		else byPokemon.set(row.pokedex_id, [row])
	}

	const candidates: RecycleCandidate[] = []

	for (const group of byPokemon.values()) {
		if (group.length < 2) continue

		// The keeper: best trained, and among equals the first one pulled. Picked
		// before any filtering, so the copy that stays is the best copy and not
		// merely the first one the rules happened to refuse.
		const keeper = group.reduce((best, row) =>
			row.xp > best.xp || (row.xp === best.xp && row.obtained_at < best.obtained_at) ? row : best,
		)

		for (const row of group) {
			if (row.id === keeper.id) continue
			if (row.rarity === 'legendary') continue
			if (levelFromXp(row.xp) !== STARTING_LEVEL) continue
			// In a team or under treatment: in use, so not spare.
			if (row.in_team) continue
			if (row.healed_at !== null) continue

			candidates.push({
				cardId: row.id,
				pokedexId: row.pokedex_id,
				name: row.name,
				rarity: row.rarity as RecyclableRarity,
				obtainedAt: row.obtained_at,
			})
		}
	}

	// Newest first, like every other listing of cards in the app.
	return candidates.sort((a, b) => b.obtainedAt - a.obtainedAt)
}

/** Everything the panel needs to describe the trade before it is made. */
export function preview(userId: string): RecyclePreview {
	const candidates = candidatesFor(userId)
	const byRarity: Record<RecyclableRarity, number> = { common: 0, uncommon: 0, rare: 0 }
	let shards = 0

	for (const candidate of candidates) {
		byRarity[candidate.rarity] += 1
		shards += SHARD_VALUE[candidate.rarity]
	}

	const carried = shardsOf(userId)
	const pot = shards + carried
	const boosters = Math.floor(pot / SHARDS_PER_BOOSTER)

	return {
		candidates,
		byRarity,
		shards,
		carried,
		boosters,
		luck: luckFor(shards, candidates.length),
		remainder: pot - boosters * SHARDS_PER_BOOSTER,
	}
}

export interface RecycleOutcome {
	/** How many cards were actually destroyed, by rarity. */
	byRarity: Record<RecyclableRarity, number>
	recycled: number
	shards: number
	carried: number
	boosters: number
	luck: number
	remainder: number
}

/**
 * Melt every eligible duplicate and mint the packs.
 *
 * One transaction for the whole thing: the cards leaving the collection and
 * the packs arriving are the same event, and a crash between the two would
 * either eat the cards or hand out free packs.
 *
 * Returns null when there is nothing to melt, which the controller turns into
 * a 409 — the button should be disabled in that case, so reaching it means the
 * client's view was stale.
 */
export function transform(userId: string): RecycleOutcome | null {
	const run = db.transaction((): RecycleOutcome | null => {
		// Re-read inside the transaction: the preview the client saw may be
		// minutes old, and only what is eligible *now* may be destroyed.
		const candidates = candidatesFor(userId)
		if (candidates.length === 0) return null

		const byRarity: Record<RecyclableRarity, number> = { common: 0, uncommon: 0, rare: 0 }
		let shards = 0
		for (const candidate of candidates) {
			byRarity[candidate.rarity] += 1
			shards += SHARD_VALUE[candidate.rarity]
		}

		const carried = shardsOf(userId)
		const pot = shards + carried
		const boosters = Math.floor(pot / SHARDS_PER_BOOSTER)
		const remainder = pot - boosters * SHARDS_PER_BOOSTER
		const luck = luckFor(shards, candidates.length)

		const destroy = db.prepare('DELETE FROM cards WHERE id = ? AND user_id = ?')
		for (const candidate of candidates) destroy.run(candidate.cardId, userId)

		db.prepare('UPDATE users SET shards = ? WHERE id = ?').run(remainder, userId)

		if (boosters > 0) {
			db.prepare(
				`INSERT INTO lucky_boosters (user_id, luck, count) VALUES (?, ?, ?)
				 ON CONFLICT (user_id, luck) DO UPDATE SET count = count + excluded.count`,
			).run(userId, luck, boosters)
		}

		return { byRarity, recycled: candidates.length, shards, carried, boosters, luck, remainder }
	})

	return run()
}

/**
 * Spend one lucky pack, the best one first, and report the luck it carried.
 *
 * Best first because a stock of packs is not a queue: nobody keeps a +3 % pack
 * for later while opening the +1 % ones, so the server does not make them say
 * so. Returns null when the stock is empty, which is how a double click on the
 * open button is refused.
 */
export function spendLucky(userId: string): number | null {
	const run = db.transaction((): number | null => {
		const row = db
			.prepare('SELECT luck, count FROM lucky_boosters WHERE user_id = ? AND count > 0 ORDER BY luck DESC LIMIT 1')
			.get(userId) as LuckyStock | undefined
		if (!row) return null

		if (row.count <= 1) {
			db.prepare('DELETE FROM lucky_boosters WHERE user_id = ? AND luck = ?').run(userId, row.luck)
		} else {
			db.prepare('UPDATE lucky_boosters SET count = count - 1 WHERE user_id = ? AND luck = ?').run(
				userId,
				row.luck,
			)
		}

		return row.luck
	})

	return run()
}

/** The odds table of a pack of this luck, as percentages the UI can print. */
export function oddsTable(luck: number): Record<Rarity, number> {
	const table: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 }
	for (const [rarity, weight] of oddsFor(luck)) table[rarity] = weight
	return table
}

export { MAX_LUCK }
