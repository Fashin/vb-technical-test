import { fetchFighter } from '../services/pokeapi'
import { computeDamage, maxHp, scaleStat, type Move } from './damage'
import { effectivenessLabel, isPokemonType } from './types'

/**
 * The combat engine: two teams, a script, and what actually happens.
 *
 * This module decides everything and narrates nothing of its own invention.
 * It is shared by the two places a fight can start:
 *
 *  - the arena (`battles.ts`), which hands it a script written by the chatbot;
 *  - the training camps (`training/training.ts`), which hand it no script at
 *    all and let every round be improvised from the attackers themselves.
 *
 * That is the whole reason it exists apart: the rules of a fight must not
 * depend on who is watching, or on whether a language model answered.
 *
 * ⚠️ The two sides are called `player` and `master` throughout, including on
 * the wire. In a training session the "master" is the wild trio — the web app
 * animates both kinds of fight with the same component, which is worth more
 * than a second vocabulary.
 */

export interface BattleFighter {
	pokedexId: number
	name: string
	types: string[]
	/** Earned in the training camps; every other number here is scaled by it. */
	level: number
	/** Battle stats, already scaled to `level` — not the Pokedex's base values. */
	attack: number
	defense: number
	specialAttack: number
	specialDefense: number
	speed: number
	hp: number
	maxHp: number
}

export interface Side {
	name: string
	team: BattleFighter[]
	/** Index into `team` of the Pokemon currently out. */
	active: number
}

export interface TurnEvent {
	side: 'player' | 'master'
	move: Move
	damage: number
	critical: boolean
	/** "C'est super efficace !" and friends, or null when neutral. */
	effectiveness: string | null
	fainted: boolean
	/** Name of the Pokemon sent out after a faint. */
	replacedBy: string | null
	/** The sentence shown while this exact attack plays out. */
	line: string
}

export interface RoundLog {
	round: number
	events: TurnEvent[]
}

/** Hard stop. A battle is a scene to watch, not a war of attrition. */
export const MAX_ROUNDS = 24

/* -------------------------------- fighters -------------------------------- */

/** Build a fighter from the Pokedex, at a given level. */
export async function toFighter(pokedexId: number, level: number): Promise<BattleFighter> {
	const { name, types, stats } = await fetchFighter(pokedexId)
	const hp = maxHp(stats.hp, level)

	// The Pokedex gives base stats; what fights is the Pokemon at its level.
	return {
		pokedexId,
		name,
		types,
		level,
		attack: scaleStat(stats.attack, level),
		defense: scaleStat(stats.defense, level),
		specialAttack: scaleStat(stats.specialAttack, level),
		specialDefense: scaleStat(stats.specialDefense, level),
		speed: scaleStat(stats.speed, level),
		hp,
		maxHp: hp,
	}
}

/* --------------------------------- actions -------------------------------- */

/** One side's intention for one round: what it does, and how it is told. */
export interface Action {
	move: Move
	line: string
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** A move the engine falls back on, built from the attacker itself. */
function improviseMove(fighter: BattleFighter): Move {
	const type = fighter.types.find(isPokemonType) ?? 'normal'
	const physical = fighter.attack >= fighter.specialAttack
	return { name: physical ? 'Charge' : 'Déflagration', type, category: physical ? 'physical' : 'special', power: 60 }
}

export function sanitizeMove(raw: unknown, fallback: BattleFighter): Move {
	const value = (raw ?? {}) as Partial<Record<keyof Move, unknown>>
	const improvised = improviseMove(fallback)

	const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 40) : improvised.name
	const type = isPokemonType(value.type) ? value.type : improvised.type
	const category = value.category === 'special' || value.category === 'physical' ? value.category : improvised.category
	const power =
		typeof value.power === 'number' && Number.isFinite(value.power)
			? Math.min(120, Math.max(10, Math.round(value.power)))
			: improvised.power

	return { name, type, category, power }
}

function defaultLine(fighter: BattleFighter, move: Move): string {
	return `${capitalize(fighter.name)} utilise ${move.name} !`
}

export function sanitizeLine(raw: unknown, fallback: string): string {
	if (typeof raw !== 'string') return fallback
	const line = raw.replace(/\s+/g, ' ').trim()
	return line ? line.slice(0, 160) : fallback
}

/** Names that stand in for one another: whoever is benched, and who replaced it. */
export type StandIn = [absent: string, present: string]

/**
 * Swap one name for another, case-insensitively, keeping the capitalisation of
 * each occurrence. Written out rather than done with a regular expression
 * because the needle is data: a Pokemon's name, not a pattern.
 */
function swapName(text: string, absent: string, present: string): string {
	const haystack = text.toLowerCase()
	const needle = absent.toLowerCase()

	let out = ''
	let at = 0
	for (let found = haystack.indexOf(needle); found !== -1; found = haystack.indexOf(needle, at)) {
		const matched = text.slice(found, found + needle.length)
		out += text.slice(at, found) + (matched[0] === matched[0].toUpperCase() ? capitalize(present) : present)
		at = found + needle.length
	}

	return out + text.slice(at)
}

/**
 * Rewrite a line onto the Pokemon that is actually out.
 *
 * A script is written before the first blow, so it cannot know that a faint
 * sent out someone else: a few rounds in, it is still naming a Pokemon that
 * has left the field. Swapping that name for its stand-in keeps the model's
 * sentence — and keeps the text describing the sprite the player looks at.
 */
function retarget(line: string, standIns: StandIn[]): string {
	return standIns.reduce(
		(text, [absent, present]) =>
			absent.toLowerCase() === present.toLowerCase() ? text : swapName(text, absent, present),
		line,
	)
}

/** Read one scripted action, retargeted onto who is actually on the field. */
function readAction(raw: unknown, fighter: BattleFighter, standIns: StandIn[]): Action {
	const value = (raw ?? {}) as Record<string, unknown>
	// A script may nest the move or inline its fields; both are read.
	const move = sanitizeMove(value.move ?? value, fighter)
	const line = sanitizeLine(value.line ?? value.narration, defaultLine(fighter, move))

	return { move, line: retarget(line, standIns) }
}

function improvisedAction(fighter: BattleFighter): Action {
	const move = improviseMove(fighter)
	return { move, line: defaultLine(fighter, move) }
}

/* -------------------------------- resolving ------------------------------- */

/** Apply one attack. Returns the event, with the knockout already handled. */
function strike(attacker: Side, defender: Side, action: Action, side: 'player' | 'master'): TurnEvent {
	const source = attacker.team[attacker.active]
	const target = defender.team[defender.active]
	const { damage, multiplier, critical } = computeDamage(action.move, source, target, Math.random())

	target.hp = Math.max(0, target.hp - damage)
	const fainted = target.hp === 0

	let replacedBy: string | null = null
	if (fainted) {
		const next = defender.team.findIndex((f) => f.hp > 0)
		if (next !== -1) {
			defender.active = next
			replacedBy = defender.team[next].name
		}
	}

	return {
		side,
		move: action.move,
		damage,
		critical,
		effectiveness: effectivenessLabel(multiplier),
		fainted,
		replacedBy,
		line: action.line,
	}
}

const alive = (side: Side) => side.team.some((f) => f.hp > 0)

/** Who the script may still be naming, and who is standing in their place. */
function standInsFor(player: Side, master: Side): StandIn[] {
	return [player, master].flatMap((side) => {
		const out = side.team[side.active].name
		return side.team.filter((_, index) => index !== side.active).map((fighter): StandIn => [fighter.name, out])
	})
}

/** Health left on a side, as a sum of per-Pokemon fractions. */
function healthLeft(side: Side): number {
	return side.team.reduce((sum, fighter) => sum + fighter.hp / fighter.maxHp, 0)
}

export interface Resolution {
	rounds: RoundLog[]
	winner: 'player' | 'master'
	/**
	 * Indices of everyone who was on the field for at least one round, per
	 * side. A Pokemon sent out by the very last knockout never acted, so it is
	 * not one of them.
	 */
	participants: { player: number[]; master: number[] }
}

/**
 * Play the fight out, from the first blow to the last.
 *
 * Both sides are mutated — their HP and who is out are the result — and the
 * rounds are returned for the client to animate. `script` is advisory: an
 * entry per round when there is one, improvisation when there is not, so a
 * missing, short or unparsable script costs the fight its commentary and
 * nothing else.
 */
export function resolveRounds(player: Side, master: Side, script: unknown[] = []): Resolution {
	const rounds: RoundLog[] = []
	const fought = { player: new Set<number>(), master: new Set<number>() }

	while (rounds.length < MAX_ROUNDS && alive(player) && alive(master)) {
		const actors = { player: player.team[player.active], master: master.team[master.active] }
		// Recorded at the top of the round: being out for a round is what counts
		// as having fought, whether you swung or only took the hit.
		fought.player.add(player.active)
		fought.master.add(master.active)
		const scripted = script[rounds.length] as Record<string, unknown> | undefined
		const benched = standInsFor(player, master)

		const actions = {
			player: scripted ? readAction(scripted.player, actors.player, benched) : improvisedAction(actors.player),
			master: scripted
				? readAction(scripted.master ?? scripted.opponent, actors.master, benched)
				: improvisedAction(actors.master),
		}

		// Fastest first, as in the games.
		const order: ('player' | 'master')[] =
			actors.player.speed >= actors.master.speed ? ['player', 'master'] : ['master', 'player']

		const events: TurnEvent[] = []
		for (const side of order) {
			if (!alive(player) || !alive(master)) break
			// A Pokemon knocked out earlier this round does not get to answer, and
			// the one that replaces it waits for the next round rather than striking
			// with a line written for its predecessor.
			if (actors[side].hp === 0) continue

			events.push(
				side === 'player'
					? strike(player, master, actions.player, 'player')
					: strike(master, player, actions.master, 'master'),
			)
		}

		rounds.push({ round: rounds.length + 1, events })
	}

	// A wipe decides it; the round cap goes to the healthier team, ties to the player.
	const winner: 'player' | 'master' = !alive(master)
		? 'player'
		: !alive(player)
			? 'master'
			: healthLeft(player) >= healthLeft(master)
				? 'player'
				: 'master'

	const sorted = (seen: Set<number>) => [...seen].sort((a, b) => a - b)
	return { rounds, winner, participants: { player: sorted(fought.player), master: sorted(fought.master) } }
}
