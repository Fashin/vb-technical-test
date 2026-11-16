/**
 * Card pools and draw odds.
 *
 * Kept to the first generation: those 151 sprites are the ones the project
 * already shows everywhere, and a pool small enough to make duplicates — and
 * therefore a collection worth completing — actually happen.
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'

/** Birds, Mewtwo, Mew. */
const LEGENDARY = [144, 145, 146, 150, 151]

/** Final evolutions and fan favourites. */
const RARE = [
	3, 6, 9, 59, 65, 68, 76, 94, 103, 112, 115, 121, 125, 126, 127, 130, 131, 134, 135, 136, 139, 141,
	142, 143, 149,
]

/** Middle evolutions and the sturdier basics. */
const UNCOMMON = [
	2, 5, 8, 12, 15, 18, 22, 24, 26, 28, 31, 34, 36, 38, 40, 42, 45, 47, 49, 51, 53, 55, 57, 62, 64, 67,
	71, 73, 75, 78, 80, 82, 85, 87, 89, 91, 93, 97, 99, 101, 105, 107, 108, 110, 113, 117, 119, 122, 124,
	128, 132, 137, 138, 140, 148,
]

const RANKED = new Set([...LEGENDARY, ...RARE, ...UNCOMMON])

/** Everything else in the Kanto dex. */
const COMMON = Array.from({ length: 151 }, (_, i) => i + 1).filter((id) => !RANKED.has(id))

export const POOLS: Record<Rarity, number[]> = {
	common: COMMON,
	uncommon: UNCOMMON,
	rare: RARE,
	legendary: LEGENDARY,
}

/**
 * Everything a booster can ever hand out: the Pokedex worth completing.
 *
 * The denominator for every completion figure in the app. Counting against
 * the 898 species the browser can show would give a percentage nobody can
 * ever move.
 */
export const DEX_TOTAL = new Set(Object.values(POOLS).flat()).size

/**
 * Draw odds for an ordinary slot, in percent. They must add up to 100.
 *
 * A legendary is one draw in a thousand: with five slots per pack and a pack
 * every ten minutes, anything looser and the five birds stop being an event.
 *
 * The weight taken off `legendary` goes to `rare` rather than to `common`:
 * making legendaries scarcer should raise the value of the tier just below,
 * not flood packs with filler. So the 0.4 point this tier lost is `rare`'s,
 * and `common` stays exactly where it was — the share of a pack that is
 * filler is a separate decision from how rare the top tier is.
 */
const ODDS: [Rarity, number][] = [
	['common', 60],
	['uncommon', 27],
	['rare', 12.9],
	['legendary', 0.1],
]

/**
 * Odds for the one guaranteed "good" slot every pack contains.
 *
 * Twice the ordinary rate for `legendary`, as everywhere else in this table:
 * the guaranteed slot is the pack's good news, so it keeps its edge over the
 * four others whatever the top tier is set to. Its 0.8 point goes to `rare`
 * for the same reason as above.
 */
const BONUS_ODDS: [Rarity, number][] = [
	['uncommon', 70],
	['rare', 29.8],
	['legendary', 0.2],
]

/**
 * Luck a recycled pack can carry, in percentage points — see
 * `boosters/recycle.ts`.
 *
 * Capped at three because the legendary slice is what a point of luck is
 * really buying, and it is a thin slice: +1 takes it from 0.1 % to 1.1 % and
 * +3 to 3.1 %, so a pack bought with rares is already an order of magnitude
 * likelier to hold one than a pack the clock handed out. That is the reward,
 * and three points of it is plenty — past that the pool stops being a pool.
 *
 * Points rather than multipliers on purpose: the bonus is a promise the panel
 * makes to the player before they destroy anything, and "+2 % on every tier"
 * is a promise they can check against the table on screen.
 */
export const MAX_LUCK = 3

export function clampLuck(luck: number): number {
	return Math.min(MAX_LUCK, Math.max(0, Math.floor(luck)))
}

/**
 * The same odds, shifted by `luck` percentage points.
 *
 * One point of luck adds one point to *each* tier above common and takes the
 * three back off common, so the table still sums to 100 and the improvement is
 * felt where it matters — a luckier pack is not a pack with more filler.
 *
 * The guaranteed slot has no common slice to pay from, so there the two points
 * come off `uncommon`, its own filler tier.
 */
function shift(odds: [Rarity, number][], luck: number, payer: Rarity): [Rarity, number][] {
	if (luck <= 0) return odds
	const raised = odds.filter(([rarity]) => rarity !== payer)
	return odds.map(([rarity, weight]): [Rarity, number] => [
		rarity,
		rarity === payer ? weight - raised.length * luck : weight + luck,
	])
}

/** The table a pack of this luck draws on, for the UI to show before opening. */
export function oddsFor(luck = 0, guaranteed = false): [Rarity, number][] {
	const clamped = clampLuck(luck)
	return guaranteed
		? shift(BONUS_ODDS, clamped, 'uncommon')
		: shift(ODDS, clamped, 'common')
}

function pick(odds: [Rarity, number][]): Rarity {
	const total = odds.reduce((sum, [, weight]) => sum + weight, 0)
	let roll = Math.random() * total
	for (const [rarity, weight] of odds) {
		roll -= weight
		if (roll <= 0) return rarity
	}
	return odds[odds.length - 1][0]
}

export function rollRarity(guaranteed = false, luck = 0): Rarity {
	return pick(oddsFor(luck, guaranteed))
}

export function pickFrom(rarity: Rarity): number {
	const pool = POOLS[rarity]
	return pool[Math.floor(Math.random() * pool.length)]
}
