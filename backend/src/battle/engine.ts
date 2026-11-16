import { fetchFighter, fetchMoveset } from '../services/pokeapi'
import { computeDamage, maxHp, scaleStat, type Move } from './damage'
import { effectiveness, effectivenessLabel, isPokemonType, type PokemonType } from './types'

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
	/**
	 * Health this Pokemon walked onto the field with.
	 *
	 * `hp` is mutated as the fight goes, so by the time the client receives the
	 * battle it holds the *final* figure and nothing says where the bars
	 * started. A training session is the case that makes this matter: a team
	 * carries its wounds in, and a replay that assumed full health showed
	 * everyone healed between sessions.
	 */
	openingHp: number
	/**
	 * The attacks this Pokemon actually knows, from PokeAPI.
	 *
	 * Four of them, one per type and only those it has reached at its level,
	 * as `fetchMoveset` chooses them. Empty when
	 * the lookup failed, and that is a supported state: the engine then
	 * improvises off the attacker's own types, which is what it always did.
	 */
	moves: Move[]
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
	/**
	 * Who struck and who was hit, as indices into each side's team.
	 *
	 * Spelled out rather than left for the client to infer. The replay used to
	 * track the field itself, assuming only a faint could change who is out —
	 * which stopped being true the moment a camp session made its winner hand
	 * over, and every number after the first hand-over landed on the wrong
	 * Pokemon's health bar.
	 */
	sourceIndex: number
	targetIndex: number
	/** Name of the Pokemon sent out after a faint. */
	replacedBy: string | null
	/** Name of the Pokemon the attacker handed over to, under `relay`. */
	handedOverTo: string | null
	/** Who is out on each side once this attack is fully resolved. */
	activeAfter: { player: number; master: number }
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
	// Side by side: the moveset is several calls behind the stats, and a fight
	// must not wait for one and then the other. Both are cached per species, so
	// this costs nothing from the second fight on.
	const [{ name, types, stats }, moveset] = await Promise.all([
		fetchFighter(pokedexId),
		// Level-gated: a fighter throws what it has learnt so far, not the
		// species' final arsenal.
		fetchMoveset(pokedexId, level),
	])
	const hp = maxHp(stats.hp, level)
	// Overwritten by `resolveRounds` for a fighter that walks in wounded.


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
		openingHp: hp,
		moves: moveset,
	}
}

/* --------------------------------- actions -------------------------------- */

/** One side's intention for one round: what it does, and how it is told. */
export interface Action {
	move: Move
	line: string
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * The attacker's own type that actually lands on `defending`, or null when
 * none of them does.
 *
 * Improvising off the attacker's primary type alone is what made a Gengar
 * throw Ghost at a Rattata for twenty-four rounds: immune, zero damage, and
 * zero the other way too, since Normal cannot touch a Ghost either. A
 * Pokemon with two types picks the one that connects, and prefers the one
 * that connects hardest.
 */
function bestOwnType(fighter: BattleFighter, defending: PokemonType[]): PokemonType | null {
	const candidates = fighter.types.filter(isPokemonType)
	// A fighter whose types PokeAPI did not give us still has to swing.
	const pool: PokemonType[] = candidates.length > 0 ? candidates : ['normal']

	let chosen: PokemonType | null = null
	let best = 0
	for (const type of pool) {
		const multiplier = effectiveness(type, defending)
		// Strictly greater, so a tie keeps the primary type — the one the sprite
		// and the commentary are about.
		if (multiplier > best) {
			best = multiplier
			chosen = type
		}
	}

	return chosen
}

/**
 * The typeless last resort, when every type the attacker has is walled.
 *
 * Struggle, as the modern games have it: no type, so no immunity applies, and
 * weak enough that it reads as scraping by rather than as a real attack.
 */
const STRUGGLE: Omit<Move, 'category'> = { name: 'Lutte', type: 'untyped', power: 40 }

/**
 * Same-type attack bonus, mirrored from `damage.ts`.
 *
 * Only used to rank moves below; the damage itself is still computed there.
 */
const STAB_WEIGHT = 1.5

/** Spread applied to each candidate's score, so a bout is not four identical rounds. */
const CHOICE_JITTER = 0.3

/**
 * How good one of the attacker's own moves looks against this target.
 *
 * The damage formula without the parts that are the same for every candidate:
 * power, the type chart, the same-type bonus, and the offensive stat against
 * the defence it is actually measured against — a special move off a Machamp
 * must not be chosen over the physical one it is built for. Zero for anything
 * the target is immune to, which is what sends the attacker to `STRUGGLE`.
 */
function scoreMove(move: Move, attacker: BattleFighter, target?: BattleFighter): number {
	const moveType = isPokemonType(move.type) ? move.type : null
	const defending = target?.types.filter(isPokemonType) ?? []
	const multiplier = moveType === null ? 1 : effectiveness(moveType, defending)
	if (multiplier === 0) return 0

	const physical = move.category === 'physical'
	const offence = physical ? attacker.attack : attacker.specialAttack
	const defence = target ? (physical ? target.defense : target.specialDefense) : 1
	const stab = moveType !== null && attacker.types.includes(moveType) ? STAB_WEIGHT : 1

	return move.power * multiplier * stab * (offence / Math.max(1, defence))
}

/**
 * The attack the engine throws when nothing scripted one.
 *
 * It picks from the Pokemon's **real** moveset (`fetchMoveset`), choosing what
 * works on the Pokemon in front of it: the move that would hurt most, with a
 * little jitter so two Pokemon trading blows for six rounds do not repeat the
 * same line. That is the whole point of carrying the moveset around — the
 * camps improvise every round, and a Dracaufeu throwing "Déflagration" every
 * time was the fight telling the player the engine had made the move up.
 *
 * Without a moveset — PokeAPI unreachable — it falls back to the generic
 * attack it always used: the attacker's best own type at power 60.
 */
function improviseMove(fighter: BattleFighter, target?: BattleFighter): Move {
	const physical = fighter.attack >= fighter.specialAttack
	const category = physical ? ('physical' as const) : ('special' as const)

	let chosen: Move | null = null
	let best = 0
	for (const move of fighter.moves) {
		const score = scoreMove(move, fighter, target) * (1 - CHOICE_JITTER + Math.random() * 2 * CHOICE_JITTER)
		if (score > best) {
			best = score
			chosen = move
		}
	}
	if (chosen) return chosen
	// It knows attacks, and the target is immune to every one of them.
	if (fighter.moves.length > 0) return { ...STRUGGLE, category }

	const type = bestOwnType(fighter, target?.types.filter(isPokemonType) ?? [])
	if (type === null) return { ...STRUGGLE, category }
	return { name: physical ? 'Charge' : 'Déflagration', type, category, power: 60 }
}

export function sanitizeMove(raw: unknown, fallback: BattleFighter, target?: BattleFighter): Move {
	const value = (raw ?? {}) as Partial<Record<keyof Move, unknown>>
	const improvised = improviseMove(fallback, target)

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
function readAction(
	raw: unknown,
	fighter: BattleFighter,
	standIns: StandIn[],
	target: BattleFighter,
): Action {
	const value = (raw ?? {}) as Record<string, unknown>
	// A script may nest the move or inline its fields; both are read.
	const move = sanitizeMove(value.move ?? value, fighter, target)
	const line = sanitizeLine(value.line ?? value.narration, defaultLine(fighter, move))

	return { move, line: retarget(line, standIns) }
}

function improvisedAction(fighter: BattleFighter, target: BattleFighter): Action {
	const move = improviseMove(fighter, target)
	return { move, line: defaultLine(fighter, move) }
}

/* -------------------------------- resolving ------------------------------- */

/**
 * The next member still standing, scanning forward from whoever is out.
 *
 * Forward and wrapping rather than "the first one alive", so a side that keeps
 * handing over walks through its whole roster instead of coming back to the
 * same Pokemon. Returns the current index when nobody else can stand.
 */
function nextAlive(side: Side): number {
	const size = side.team.length
	for (let step = 1; step <= size; step++) {
		const index = (side.active + step) % size
		if (side.team[index].hp > 0) return index
	}
	return side.active
}

/**
 * Apply one attack. Returns the event, with the knockout already handled.
 *
 * `relay` is the training camps' rule: a Pokemon that scores a knockout has
 * done its turn and hands over to the next one. Without it only a faint ever
 * changes who is out, so a team whose lead never falls would field exactly one
 * Pokemon however many it brought.
 */
function strike(
	attacker: Side,
	defender: Side,
	action: Action,
	side: 'player' | 'master',
	relay: boolean,
): TurnEvent {
	// Read before anything moves: these two are what the replay needs.
	const sourceIndex = attacker.active
	const targetIndex = defender.active
	const source = attacker.team[sourceIndex]
	const target = defender.team[targetIndex]
	const { damage, multiplier, critical } = computeDamage(action.move, source, target, Math.random())

	target.hp = Math.max(0, target.hp - damage)
	const fainted = target.hp === 0

	let replacedBy: string | null = null
	let handedOverTo: string | null = null
	if (fainted) {
		const next = nextAlive(defender)
		if (defender.team[next].hp > 0) {
			defender.active = next
			replacedBy = defender.team[next].name
		}
		// Its turn is over, whether or not anyone is left to answer.
		if (relay) {
			const relieved = nextAlive(attacker)
			if (relieved !== sourceIndex) {
				attacker.active = relieved
				handedOverTo = attacker.team[relieved].name
			}
		}
	}

	return {
		side,
		move: action.move,
		damage,
		critical,
		effectiveness: effectivenessLabel(multiplier),
		fainted,
		sourceIndex,
		targetIndex,
		replacedBy,
		handedOverTo,
		activeAfter: { player: 0, master: 0 },
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
export interface BattleRules {
	/**
	 * Hand over to the next Pokemon after scoring a knockout, on both sides.
	 *
	 * What turns a 6-against-6 into one bout each instead of one Pokemon
	 * clearing the field. The arena and player duels leave it off: there, who
	 * stays out is part of what the chatbot's script is about.
	 */
	relay?: boolean
	/**
	 * Hard stop for this fight, defaulting to `MAX_ROUNDS`.
	 *
	 * A relayed 6-against-6 needs a longer leash than a single bout: at the
	 * arena's cap the last Pokemon of a full team would never reach the field,
	 * and the fight would be decided on remaining health instead of a wipe.
	 */
	maxRounds?: number
}

export function resolveRounds(
	player: Side,
	master: Side,
	script: unknown[] = [],
	rules: BattleRules = {},
): Resolution {
	const relay = rules.relay === true
	const cap = Math.max(1, Math.round(rules.maxRounds ?? MAX_ROUNDS))

	// Recorded before the first blow: the caller may have set `hp` to what each
	// Pokemon carried in from an earlier fight, and that is the only moment the
	// starting figure exists.
	for (const side of [player, master]) {
		for (const fighter of side.team) fighter.openingHp = fighter.hp
	}

	const rounds: RoundLog[] = []
	const fought = { player: new Set<number>(), master: new Set<number>() }

	while (rounds.length < cap && alive(player) && alive(master)) {
		const actors = { player: player.team[player.active], master: master.team[master.active] }
		// Recorded at the top of the round: being out for a round is what counts
		// as having fought, whether you swung or only took the hit.
		fought.player.add(player.active)
		fought.master.add(master.active)
		const scripted = script[rounds.length] as Record<string, unknown> | undefined
		const benched = standInsFor(player, master)

		const actions = {
			player: scripted
				? readAction(scripted.player, actors.player, benched, actors.master)
				: improvisedAction(actors.player, actors.master),
			master: scripted
				? readAction(scripted.master ?? scripted.opponent, actors.master, benched, actors.player)
				: improvisedAction(actors.master, actors.player),
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

			const event =
				side === 'player'
					? strike(player, master, actions.player, 'player', relay)
					: strike(master, player, actions.master, 'master', relay)
			// Stamped here rather than inside `strike`, which only ever sees one
			// side as the attacker and the other as the defender.
			event.activeAfter = { player: player.active, master: master.active }
			events.push(event)
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
