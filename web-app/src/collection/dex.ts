import type { Rarity } from '../boosters/api'

/**
 * How big the collectable Pokédex is, tier by tier and type by type.
 *
 * These are the denominators every completion figure on the collection screen
 * is drawn against. They are constants rather than a request: the pools are
 * fixed by the game's own rules, and a bar that cannot say "12 / 66" until a
 * round trip lands would show an empty track on open.
 *
 * `RARITY_POOL` mirrors `backend/src/boosters/rarity.ts` — the four pools a
 * booster draws from, which together make the 151 obtainable Pokémon.
 */
export const RARITY_POOL: Record<Rarity, number> = {
	common: 66,
	uncommon: 55,
	rare: 25,
	legendary: 5,
}

/** Everything a booster can ever hand out. Mirrors the backend's `DEX_TOTAL`. */
export const DEX_TOTAL = 151

/**
 * Kanto species per type, counted from PokeAPI's own type listings so the
 * denominator matches the typing the cards actually carry — Magnéti is
 * Électrik/Acier there and Mélofée is Fée, as current games have them, not as
 * the first generation did. A species with two types counts in both.
 *
 * Ténèbres is absent from the first generation entirely; it sits here at zero
 * so the table stays the full eighteen, and the grid simply never draws it.
 */
export const TYPE_POOL: Record<string, number> = {
	normal: 22,
	fire: 12,
	water: 32,
	electric: 9,
	grass: 14,
	ice: 5,
	fighting: 8,
	poison: 33,
	ground: 14,
	flying: 19,
	psychic: 14,
	bug: 12,
	rock: 11,
	ghost: 3,
	dragon: 3,
	dark: 0,
	steel: 2,
	fairy: 5,
}
