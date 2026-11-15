import { effectiveness, isPokemonType, type PokemonType } from './types'

/**
 * Damage, from the mainline games' formula with the parts a web demo does not
 * need stripped out.
 *
 * Each fighter brings its own level, earned in the training camps, and the
 * level drives both the damage and the HP pool — so a trained Caterpie really
 * does outlast an untrained Dragonite. No items, no abilities, no status: the
 * point is a readable progression, not a battle simulator.
 */

/** Same-type attack bonus. */
const STAB = 1.5

export interface Move {
	name: string
	type: string
	category: 'physical' | 'special'
	power: number
}

export interface Combatant {
	types: string[]
	level: number
	attack: number
	defense: number
	specialAttack: number
	specialDefense: number
}

export interface DamageResult {
	damage: number
	multiplier: number
	critical: boolean
}

/**
 * @param roll 0..1, injected so a turn can be replayed — the caller owns the
 *             randomness and the tests do not have to stub `Math.random`.
 */
export function computeDamage(move: Move, attacker: Combatant, defender: Combatant, roll: number): DamageResult {
	// A move with no type in the chart is resolved without the chart: no
	// effectiveness, no same-type bonus. `improviseMove` reaches for one when
	// every type the attacker actually has is walled, so that a matchup nobody
	// can hurt still resolves instead of running the clock out at zero.
	const moveType: PokemonType | null = isPokemonType(move.type) ? move.type : null
	const multiplier = moveType === null ? 1 : effectiveness(moveType, defender.types.filter(isPokemonType))

	if (multiplier === 0) return { damage: 0, multiplier, critical: false }

	const physical = move.category === 'physical'
	const offence = physical ? attacker.attack : attacker.specialAttack
	const defence = physical ? defender.defense : defender.specialDefense

	// Crits are rolled off the same number, so one roll decides the whole hit.
	const critical = roll > 0.94
	const stab = moveType !== null && attacker.types.includes(moveType) ? STAB : 1
	// 0.85..1.00, the games' damage spread.
	const variance = 0.85 + roll * 0.15

	const level = Math.max(1, attacker.level)
	const base = Math.floor(((2 * level) / 5 + 2) * move.power * (offence / Math.max(1, defence))) / 50 + 2
	const damage = Math.floor(base * multiplier * stab * variance * (critical ? 1.5 : 1))

	// A connecting move always does something, however resisted.
	return { damage: Math.max(1, damage), multiplier, critical }
}

/**
 * A battle stat from its base value and a level, as the games compute it.
 *
 * This is what makes a level worth earning. Without it only the damage
 * formula's own level term would scale, the HP pool would scale with it, and
 * the two would very nearly cancel out: a level 5 team could trade blows with
 * a level 12 one, and the training camps would be decoration.
 */
export function scaleStat(base: number, level: number): number {
	return Math.floor(((2 * base + 31) * Math.max(1, level)) / 100) + 5
}

/** Battle HP from a base HP stat and a level. */
export function maxHp(baseHp: number, level: number): number {
	const capped = Math.max(1, level)
	return Math.floor(((2 * baseHp + 31) * capped) / 100) + capped + 10
}
