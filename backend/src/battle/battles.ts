import { randomUUID } from 'crypto'

import { recordWounds, type Wound } from '../care/healing'
import { db } from '../db'
import { findMaster, masterLevel } from '../arena/masters'
import { MAX_ROUNDS, resolveRounds, toFighter, type RoundLog, type Side } from './engine'
import { requestScript } from './script'

/**
 * Arena battles against the masters: persistence, the chatbot, the reward.
 *
 * The fight itself belongs to `engine.ts`. What is left here is what makes it
 * an *arena* battle: it is asked once, before the first blow, for a script —
 * one attack and one line of commentary per side per round — and the engine
 * then decides what that script actually does. Damage, HP, faints, who wins
 * and what it pays are computed from the type chart and the base stats. A
 * model that hallucinated a knockout, or a client that claimed one, changes
 * nothing.
 *
 * Asking once rather than once per round is what makes the fight watchable:
 * the browser receives the whole battle, commentary included, and plays it as
 * one continuous scene instead of stopping for a request between every blow.
 *
 * One battle per account at a time, held in SQLite as JSON so a reload or a
 * server restart does not lose it.
 */

export type { BattleFighter, RoundLog, Side, TurnEvent } from './engine'

export type BattleStatus = 'active' | 'won' | 'lost'

export interface BattleState {
	id: string
	masterId: string
	masterName: string
	round: number
	player: Side
	master: Side
	status: BattleStatus
	/**
	 * The cards behind `player.team`, in the same order.
	 *
	 * Kept beside the fighters rather than inside them: the engine has no
	 * business knowing about storage, but the damage taken has to find its way
	 * back to the right card once the fight is over.
	 */
	playerCardIds: string[]
	/** Opening line, written by the model when the battle is resolved. */
	intro: string
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

/** One of the player's cards, as the arena receives it. */
export interface Entrant {
	cardId: string
	pokedexId: number
	level: number
	/** 0..1 of its maximum still standing — damage carried from past fights. */
	health: number
	/** True while it is at the healing centre, and so cannot be fielded. */
	inCare: boolean
}

/** Who can actually walk onto the sand: not the fainted, not the convalescing. */
export function fieldable(entrants: Entrant[]): Entrant[] {
	return entrants.filter((entrant) => !entrant.inCare && entrant.health > 0)
}

export type StartResult =
	| { ok: true; battle: BattleState }
	| { ok: false; reason: 'MASTER_NOT_FOUND' | 'EMPTY_TEAM' | 'ALREADY_FIGHTING' | 'NO_HEALTHY_TEAM' }

export async function startBattle(
	userId: string,
	playerName: string,
	masterId: string,
	entrants: Entrant[],
): Promise<StartResult> {
	if (getActiveBattle(userId)) return { ok: false, reason: 'ALREADY_FIGHTING' }

	const master = findMaster(masterId)
	if (!master) return { ok: false, reason: 'MASTER_NOT_FOUND' }
	if (entrants.length === 0) return { ok: false, reason: 'EMPTY_TEAM' }

	const fit = fieldable(entrants).slice(0, 6)
	// A team that exists but cannot stand up is its own answer, not an empty one.
	if (fit.length === 0) return { ok: false, reason: 'NO_HEALTHY_TEAM' }

	// The master's whole team fights at the level its rank announces.
	const level = masterLevel(master.tier)
	const [playerTeam, masterTeam] = await Promise.all([
		Promise.all(fit.map(async (entrant) => {
			const fighter = await toFighter(entrant.pokedexId, entrant.level)
			// It walks in as it walked out of its last fight.
			fighter.hp = Math.max(1, Math.round(fighter.maxHp * entrant.health))
			return fighter
		})),
		Promise.all(master.team.map((pokedexId) => toFighter(pokedexId, level))),
	])

	const state: BattleState = {
		id: randomUUID(),
		masterId: master.id,
		masterName: master.name,
		round: 0,
		player: { name: playerName, team: playerTeam, active: 0 },
		master: { name: master.name, team: masterTeam, active: 0 },
		status: 'active',
		playerCardIds: fit.map((entrant) => entrant.cardId),
		intro: '',
		log: [],
		reward: null,
	}

	save(state.id, userId, null, state)
	return { ok: true, battle: state }
}

/* --------------------------------- running --------------------------------- */

export type RunResult =
	| { ok: true; battle: BattleState; degraded: boolean }
	| { ok: false; reason: 'NO_BATTLE' | 'FINISHED' }

/**
 * Resolve the battle, from the first blow to the last.
 *
 * Rewards are granted here rather than by the client, and only on the first
 * win against a given master — the ladder can be re-run, but it pays once.
 */
export async function runBattle(userId: string): Promise<RunResult> {
	const row = activeRow(userId)
	if (!row) return { ok: false, reason: 'NO_BATTLE' }

	const state = JSON.parse(row.state) as BattleState
	if (state.status !== 'active') return { ok: false, reason: 'FINISHED' }

	const script = await requestScript(
		state.player,
		state.master,
		`Combat d’arène : ${state.player.name} affronte ${state.masterName}.`,
	)
	// A master fields six, like the player: the default cap was set for a single
	// bout and would decide a full 6-against-6 on remaining health before the last
	// Pokemon of either team ever reached the sand.
	const { rounds, winner } = resolveRounds(state.player, state.master, script.rounds, {
		maxRounds: Math.max(MAX_ROUNDS, (state.player.team.length + state.master.team.length) * 4),
	})

	state.intro = script.intro
	// A battle is told as a whole, so a resumed one is retold from its start.
	state.round = rounds.length
	state.log = rounds
	state.status = winner === 'player' ? 'won' : 'lost'
	state.reward = winner === 'player' ? grantVictory(userId, state.masterId) : 0

	// What the arena costs: every hit point left on the sand stays lost until
	// the healing centre gives it back.
	const wounds: Wound[] = state.player.team.map((fighter, index) => ({
		cardId: state.playerCardIds?.[index] ?? '',
		lost: 1 - fighter.hp / fighter.maxHp,
	}))
	recordWounds(userId, wounds.filter((wound) => wound.cardId))

	save(state.id, userId, null, state)
	return { ok: true, battle: state, degraded: script.degraded }
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
