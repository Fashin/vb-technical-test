import { randomUUID } from 'crypto'

import { db } from '../db'
import { findMaster } from '../arena/masters'
import { fetchFighter } from '../services/pokeapi'
import { ask, VirtualBrainError } from '../virtualbrain/client'
import { computeDamage, maxHp, type Move } from './damage'
import { effectivenessLabel, isPokemonType } from './types'

/**
 * Turn-based battles against the arena's masters.
 *
 * The split is the point of the whole feature: **the language model picks the
 * moves, this file decides what they do.** Damage, HP, faints, who wins and
 * what it pays are computed here from the type chart and the base stats. A
 * model that hallucinated a knockout, or a client that claimed one, changes
 * nothing.
 *
 * One battle per account at a time, held in SQLite as JSON so a reload or a
 * server restart does not lose it.
 */

export interface BattleFighter {
	pokedexId: number
	name: string
	types: string[]
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
}

export interface RoundLog {
	round: number
	narration: string
	events: TurnEvent[]
}

export type BattleStatus = 'active' | 'won' | 'lost'

export interface BattleState {
	id: string
	masterId: string
	masterName: string
	round: number
	player: Side
	master: Side
	status: BattleStatus
	log: RoundLog[]
	/** Boosters granted by the win, null until it is won (or 0 if already beaten). */
	reward: number | null
}

interface BattleRow {
	id: string
	user_id: string
	session_id: string | null
	state: string
	status: BattleStatus
}

/** Rounds kept in the returned log; the client only ever shows the recent ones. */
const LOG_LIMIT = 30

/* --------------------------------- storage --------------------------------- */

function save(id: string, userId: string, sessionId: string | null, state: BattleState): void {
	db.prepare(
		`INSERT INTO battles (id, user_id, master_id, session_id, state, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, state = excluded.state,
		                               status = excluded.status, updated_at = excluded.updated_at`,
	).run(id, userId, state.masterId, sessionId, JSON.stringify(state), state.status, Date.now(), Date.now())
}

function activeRow(userId: string): BattleRow | undefined {
	return db
		.prepare(`SELECT id, user_id, session_id, state, status FROM battles WHERE user_id = ? AND status = 'active'`)
		.get(userId) as BattleRow | undefined
}

export function getActiveBattle(userId: string): BattleState | null {
	const row = activeRow(userId)
	return row ? (JSON.parse(row.state) as BattleState) : null
}

/** Abandon the running battle, if any. Counts as a loss, not as nothing. */
export function forfeit(userId: string): boolean {
	const row = activeRow(userId)
	if (!row) return false

	const state = JSON.parse(row.state) as BattleState
	state.status = 'lost'
	save(row.id, userId, row.session_id, state)
	return true
}

/* --------------------------------- starting -------------------------------- */

async function toFighter(pokedexId: number): Promise<BattleFighter> {
	const { name, types, stats } = await fetchFighter(pokedexId)
	const hp = maxHp(stats.hp)
	return {
		pokedexId,
		name,
		types,
		attack: stats.attack,
		defense: stats.defense,
		specialAttack: stats.specialAttack,
		specialDefense: stats.specialDefense,
		speed: stats.speed,
		hp,
		maxHp: hp,
	}
}

export type StartResult =
	| { ok: true; battle: BattleState }
	| { ok: false; reason: 'MASTER_NOT_FOUND' | 'EMPTY_TEAM' | 'ALREADY_FIGHTING' }

export async function startBattle(
	userId: string,
	playerName: string,
	masterId: string,
	pokedexIds: number[],
): Promise<StartResult> {
	if (getActiveBattle(userId)) return { ok: false, reason: 'ALREADY_FIGHTING' }

	const master = findMaster(masterId)
	if (!master) return { ok: false, reason: 'MASTER_NOT_FOUND' }
	if (pokedexIds.length === 0) return { ok: false, reason: 'EMPTY_TEAM' }

	const [playerTeam, masterTeam] = await Promise.all([
		Promise.all(pokedexIds.slice(0, 6).map(toFighter)),
		Promise.all(master.team.map(toFighter)),
	])

	const state: BattleState = {
		id: randomUUID(),
		masterId: master.id,
		masterName: master.name,
		round: 0,
		player: { name: playerName, team: playerTeam, active: 0 },
		master: { name: master.name, team: masterTeam, active: 0 },
		status: 'active',
		log: [],
		reward: null,
	}

	save(state.id, userId, null, state)
	return { ok: true, battle: state }
}

/* ------------------------------- asking the LLM ------------------------------ */

/** A move the engine falls back on, built from the attacker itself. */
function improviseMove(fighter: BattleFighter): Move {
	const type = fighter.types.find(isPokemonType) ?? 'normal'
	const physical = fighter.attack >= fighter.specialAttack
	return { name: physical ? 'Charge' : 'Déflagration', type, category: physical ? 'physical' : 'special', power: 60 }
}

function sanitizeMove(raw: unknown, fallback: BattleFighter): Move {
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

/** Pull the first JSON object out of whatever the model replied with. */
function extractJson(text: string): unknown {
	const start = text.indexOf('{')
	const end = text.lastIndexOf('}')
	if (start === -1 || end <= start) return null
	try {
		return JSON.parse(text.slice(start, end + 1))
	} catch {
		return null
	}
}

interface Intent {
	playerMove: Move
	masterMove: Move
	narration: string
}

function describe(side: Side): string {
	const fighter = side.team[side.active]
	return `${fighter.name} (${fighter.types.join('/')}) ${fighter.hp}/${fighter.maxHp} HP`
}

/**
 * Ask the chatbot which moves are used this round.
 *
 * Everything about the answer is treated as a suggestion: a missing field, a
 * bogus type or plain prose instead of JSON all fall back to an improvised
 * move, so an unavailable or badly-prompted model slows the battle down
 * instead of breaking it.
 */
async function requestIntent(
	state: BattleState,
	sessionId: string | null,
): Promise<{ intent: Intent; sessionId: string | null; degraded: boolean }> {
	const player = state.player.team[state.player.active]
	const master = state.master.team[state.master.active]

	const query = [
		`ROUND ${state.round + 1}`,
		`Dresseur ${state.player.name}: ${describe(state.player)}`,
		`Maître ${state.master.name}: ${describe(state.master)}`,
		'Choisis une attaque pour chacun et décris l’échange.',
	].join('\n')

	try {
		const answer = await ask(query, sessionId)
		const parsed = extractJson(answer.text) as Record<string, unknown> | null

		const narration =
			typeof parsed?.narration === 'string' && parsed.narration.trim()
				? parsed.narration.trim()
				: // No JSON: the prose itself is the commentary, trimmed to a sane size.
					answer.text.replace(/\s+/g, ' ').trim().slice(0, 400)

		return {
			intent: {
				playerMove: sanitizeMove(parsed?.playerMove, player),
				masterMove: sanitizeMove(parsed?.opponentMove ?? parsed?.masterMove, master),
				narration: narration || 'Les deux dresseurs s’observent.',
			},
			sessionId: answer.sessionId,
			degraded: parsed === null,
		}
	} catch (cause) {
		// The arena keeps working without the chatbot; it just stops narrating.
		const reason = cause instanceof VirtualBrainError ? cause.code : 'unknown'
		console.warn('[battle] falling back to improvised moves:', reason)
		return {
			intent: {
				playerMove: improviseMove(player),
				masterMove: improviseMove(master),
				narration: 'Les deux Pokémon s’élancent.',
			},
			sessionId,
			degraded: true,
		}
	}
}

/* ---------------------------------- a round --------------------------------- */

/** Apply one attack. Returns the event, with the knockout already handled. */
function strike(attacker: Side, defender: Side, move: Move, side: 'player' | 'master'): TurnEvent {
	const source = attacker.team[attacker.active]
	const target = defender.team[defender.active]
	const { damage, multiplier, critical } = computeDamage(move, source, target, Math.random())

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
		move,
		damage,
		critical,
		effectiveness: effectivenessLabel(multiplier),
		fainted,
		replacedBy,
	}
}

const alive = (side: Side) => side.team.some((f) => f.hp > 0)

export type TurnResult =
	| { ok: true; battle: BattleState; round: RoundLog; degraded: boolean }
	| { ok: false; reason: 'NO_BATTLE' | 'FINISHED' }

/**
 * Play one round: both Pokemon act, fastest first.
 *
 * Rewards are granted here rather than by the client, and only on the first
 * win against a given master — the ladder can be re-run, but it pays once.
 */
export async function playTurn(userId: string): Promise<TurnResult> {
	const row = activeRow(userId)
	if (!row) return { ok: false, reason: 'NO_BATTLE' }

	const state = JSON.parse(row.state) as BattleState
	if (state.status !== 'active') return { ok: false, reason: 'FINISHED' }

	const { intent, sessionId, degraded } = await requestIntent(state, row.session_id)

	const playerFirst = state.player.team[state.player.active].speed >= state.master.team[state.master.active].speed
	const order: ('player' | 'master')[] = playerFirst ? ['player', 'master'] : ['master', 'player']

	const events: TurnEvent[] = []
	for (const side of order) {
		if (!alive(state.player) || !alive(state.master)) break
		// A Pokemon knocked out earlier this round does not get to answer.
		if (side === 'player' && state.player.team[state.player.active].hp === 0) continue
		if (side === 'master' && state.master.team[state.master.active].hp === 0) continue

		events.push(
			side === 'player'
				? strike(state.player, state.master, intent.playerMove, 'player')
				: strike(state.master, state.player, intent.masterMove, 'master'),
		)
	}

	state.round += 1
	const round: RoundLog = { round: state.round, narration: intent.narration, events }
	state.log = [...state.log, round].slice(-LOG_LIMIT)

	if (!alive(state.master)) {
		state.status = 'won'
		state.reward = grantVictory(userId, state.masterId)
	} else if (!alive(state.player)) {
		state.status = 'lost'
		state.reward = 0
	}

	save(state.id, userId, sessionId, state)
	return { ok: true, battle: state, round, degraded }
}

/** Record the win and pay the reward, once per master. */
function grantVictory(userId: string, masterId: string): number {
	const master = findMaster(masterId)
	if (!master) return 0

	const already = db
		.prepare('SELECT 1 FROM master_victories WHERE user_id = ? AND master_id = ?')
		.get(userId, masterId)

	db.prepare(
		'INSERT OR IGNORE INTO master_victories (user_id, master_id, defeated_at) VALUES (?, ?, ?)',
	).run(userId, masterId, Date.now())

	if (already) return 0

	db.prepare('UPDATE users SET boosters_pending = MIN(5, boosters_pending + ?) WHERE id = ?').run(
		master.reward,
		userId,
	)
	return master.reward
}
