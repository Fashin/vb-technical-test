import { effectiveness, isPokemonType, type PokemonType } from './types'

/**
 * Damage, from the mainline games' formula with the parts a web demo does not
 * need stripped out.
 *
 * Every fighter is treated as level 50 so that teams built out of whatever the
 * boosters happened to give are still comparable: the difference between a
 * Caterpie and a Dragonite is then their base stats, not a level gap nobody
 * chose. No items, no abilities, no status — the brief's bonus asks for a
 * round-by-round loop, not a battle simulator.
 */
const LEVEL = 50

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
	const moveType: PokemonType = isPokemonType(move.type) ? move.type : 'normal'
	const multiplier = effectiveness(moveType, defender.types.filter(isPokemonType))

	if (multiplier === 0) return { damage: 0, multiplier, critical: false }

	const physical = move.category === 'physical'
	const offence = physical ? attacker.attack : attacker.specialAttack
	const defence = physical ? defender.defense : defender.specialDefense

	// Crits are rolled off the same number, so one roll decides the whole hit.
	const critical = roll > 0.94
	const stab = attacker.types.includes(moveType) ? STAB : 1
	// 0.85..1.00, the games' damage spread.
	const variance = 0.85 + roll * 0.15

	const base = Math.floor(((2 * LEVEL) / 5 + 2) * move.power * (offence / Math.max(1, defence))) / 50 + 2
	const damage = Math.floor(base * multiplier * stab * variance * (critical ? 1.5 : 1))

	// A connecting move always does something, however resisted.
	return { damage: Math.max(1, damage), multiplier, critical }
}

/** Battle HP from a base HP stat, at the fixed level. */
export function maxHp(baseHp: number): number {
	return Math.floor(((2 * baseHp + 31) * LEVEL) / 100) + LEVEL + 10
}
