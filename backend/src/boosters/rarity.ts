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

/** Draw odds for an ordinary slot, in percent. They must add up to 100. */
const ODDS: [Rarity, number][] = [
	['common', 60],
	['uncommon', 27],
	['rare', 11],
	['legendary', 2],
]

/** Odds for the one guaranteed "good" slot every pack contains. */
const BONUS_ODDS: [Rarity, number][] = [
	['uncommon', 70],
	['rare', 26],
	['legendary', 4],
]

function pick(odds: [Rarity, number][]): Rarity {
	const total = odds.reduce((sum, [, weight]) => sum + weight, 0)
	let roll = Math.random() * total
	for (const [rarity, weight] of odds) {
		roll -= weight
		if (roll <= 0) return rarity
	}
	return odds[odds.length - 1][0]
}

export function rollRarity(guaranteed = false): Rarity {
	return pick(guaranteed ? BONUS_ODDS : ODDS)
}

export function pickFrom(rarity: Rarity): number {
	const pool = POOLS[rarity]
	return pool[Math.floor(Math.random() * pool.length)]
}
