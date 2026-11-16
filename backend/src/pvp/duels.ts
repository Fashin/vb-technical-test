import { randomUUID } from 'crypto'

import type { BattleState } from '../battle/battles'
import { fieldable, type Entrant } from '../battle/battles'
import { resolveRounds, toFighter, type RoundLog, type Side, type TurnEvent } from '../battle/engine'
import { requestScript } from '../battle/script'
import { recordWounds, type Wound } from '../care/healing'
import { db } from '../db'
import { levelCapOf } from '../progression/badges'
import { grantXp, xpReward, type XpAward, type XpGain } from '../progression/levels'
import { getActiveTeamId, getTeam, type TeamMember } from '../teams/teams'
import { fixedWindow } from '../util/throttle'
import { withinReach } from './encounters'

/**
 * Duels between players.
 *
 * The same engine, the same narration and the same consequences as the arena:
 * both teams come as they are — levels earned in the camps, hit points still
 * missing from the last fight — and both walk away hurt. Only the winner's
 * Pokemon take experience, and only the ones that actually fought.
 *
 * Nothing is persisted mid-fight. A duel is resolved in one pass on
 * acceptance, exactly like an arena battle, so there is no half-finished
 * encounter to clean up when somebody closes their laptop.
 */

/** Experience the winner's fighters share for beating a trainer's team. */
const WIN_BONUS = 1.5

/**
 * Duels one account may fight per window.
 *
 * Each one has the chatbot write a whole script: real seconds, and a real
 * billed call. A duel already needs a second consenting player standing next
 * to you, which is most of the protection — this closes the case of two
 * accounts looping duels between themselves. Ten per ten minutes is far more
 * than playing needs and far less than a script would spend.
 */
const duelWindow = fixedWindow(10, 10 * 60 * 1000)

function entrantsOf(members: TeamMember[]): Entrant[] {
	return members.map((member) => ({
		cardId: member.cardId,
		pokedexId: member.pokedexId,
		level: member.level,
		health: member.health,
		inCare: member.inCare,
	}))
}

async function sideOf(name: string, entrants: Entrant[]): Promise<Side> {
	const team = await Promise.all(
		entrants.map(async (entrant) => {
			const fighter = await toFighter(entrant.pokedexId, entrant.level)
			// It walks in as it walked out of its last fight.
			fighter.hp = Math.max(1, Math.round(fighter.maxHp * entrant.health))
			return fighter
		}),
	)
	return { name, team, active: 0 }
}

export interface DuelOutcome {
	id: string
	/** The fight, oriented for the challenger; `mirror` flips it for the other. */
	battle: BattleState
	winnerUserId: string
	loserUserId: string
	/** Experience credited, by user id. Only the winner's side has entries. */
	gains: Record<string, XpGain[]>
	degraded: boolean
}

export type DuelResult =
	| { ok: true; duel: DuelOutcome }
	| { ok: false; reason: 'TOO_FAR' | 'NO_TEAM' | 'NO_HEALTHY_TEAM' | 'TOO_MANY' }

interface Challenger {
	userId: string
	name: string
}

/**
 * Fight one duel, from both teams to both sets of consequences.
 *
 * The distance is checked once more here: the invitation may have been
 * answered from across the map, or either player may simply have walked off
 * while the chatbot was writing.
 */
export async function fight(a: Challenger, b: Challenger): Promise<DuelResult> {
	if (!withinReach(a.userId, b.userId)) return { ok: false, reason: 'TOO_FAR' }

	const teams = [a, b].map((player) => {
		const teamId = getActiveTeamId(player.userId)
		return teamId ? getTeam(player.userId, teamId) : null
	})
	if (teams.some((team) => !team || team.members.length === 0)) return { ok: false, reason: 'NO_TEAM' }

	const rosters = teams.map((team) => fieldable(entrantsOf(team!.members)).slice(0, 6))
	// A team that exists but cannot stand up is its own answer, not an empty one.
	if (rosters.some((roster) => roster.length === 0)) return { ok: false, reason: 'NO_HEALTHY_TEAM' }

	// Spent here and not earlier: a duel refused for distance or for a team in
	// no state to fight has cost nothing, so it should cost no budget either.
	// Both players pay, so neither can make the other foot the bill.
	// Looked at before anything is spent: charging one player for a duel the
	// other's budget refuses would be a silent theft of their allowance.
	if ([a, b].some((player) => duelWindow.remaining(player.userId) <= 0)) {
		return { ok: false, reason: 'TOO_MANY' }
	}
	for (const player of [a, b]) duelWindow.take(player.userId)

	const [challenger, defender] = await Promise.all([sideOf(a.name, rosters[0]), sideOf(b.name, rosters[1])])

	const script = await requestScript(
		challenger,
		defender,
		`Duel de dresseurs : ${a.name} défie ${b.name}.`,
	)
	const { rounds, winner, participants } = resolveRounds(challenger, defender, script.rounds)

	/* ------------------------------- consequences ------------------------------ */

	// Both sides pay for it, whoever won. Each list is written under its own
	// owner, so one player's result can never touch the other's cards.
	const woundsOf = (side: Side, roster: Entrant[]): Wound[] =>
		side.team.map((fighter, index) => ({
			cardId: roster[index].cardId,
			lost: 1 - fighter.hp / fighter.maxHp,
		}))

	recordWounds(a.userId, woundsOf(challenger, rosters[0]))
	recordWounds(b.userId, woundsOf(defender, rosters[1]))

	const winnerIsA = winner === 'player'
	const won = { player: a, roster: rosters[0], side: challenger, fought: participants.player }
	const lost = { player: b, roster: rosters[1], side: defender, fought: participants.master }
	const [victor, vanquished] = winnerIsA ? [won, lost] : [lost, won]

	// Paid on the beaten team's level, so defeating someone stronger is worth
	// more — and only to the Pokemon that were actually on the field.
	const purse = Math.round(
		vanquished.side.team.reduce((sum, fighter) => sum + xpReward(fighter.level), 0) * WIN_BONUS,
	)
	const share = victor.fought.length > 0 ? Math.floor(purse / victor.fought.length) : 0
	const payout: XpAward[] = victor.fought.map((index) => ({ cardId: victor.roster[index].cardId, amount: share }))

	const id = randomUUID()
	// Capped by the winner's own badges, like every other source of experience:
	// a duel that pushed a Pokemon past the level its badges allow would be the
	// hole in the gate the camps are there to close.
	const gains = grantXp(payout, levelCapOf(victor.player.userId))

	db.prepare('INSERT INTO duels (id, winner_id, loser_id, fought_at) VALUES (?, ?, ?, ?)').run(
		id,
		victor.player.userId,
		vanquished.player.userId,
		Date.now(),
	)

	const battle: BattleState = {
		id,
		masterId: `duel:${b.userId}`,
		masterName: b.name,
		round: rounds.length,
		player: challenger,
		master: defender,
		status: winnerIsA ? 'won' : 'lost',
		playerCardIds: rosters[0].map((entrant) => entrant.cardId),
		intro: script.intro,
		log: rounds,
		reward: null,
	}

	return {
		ok: true,
		duel: {
			id,
			battle,
			winnerUserId: victor.player.userId,
			loserUserId: vanquished.player.userId,
			gains: { [victor.player.userId]: gains },
			degraded: script.degraded,
		},
	}
}

/**
 * Flip a duel so the other player is the one on the `player` side.
 *
 * The web app draws "you" at the bottom and the opponent at the top, and it
 * does so from the `player`/`master` labels alone. Rather than teach every
 * component a point of view, the server sends each client a battle already
 * written from theirs — which is also why every event's `side` is swapped.
 */
export function mirror(battle: BattleState, opponentName: string): BattleState {
	const flip = (event: TurnEvent): TurnEvent => ({
		...event,
		side: event.side === 'player' ? 'master' : 'player',
		// `sourceIndex` and `targetIndex` need no flipping: each indexes the team
		// of whoever the (now swapped) `side` points at, so they stay true. The
		// two indices in `activeAfter` are keyed by side, so they do.
		activeAfter: { player: event.activeAfter.master, master: event.activeAfter.player },
	})

	const log: RoundLog[] = battle.log.map((round) => ({ ...round, events: round.events.map(flip) }))

	return {
		...battle,
		masterName: opponentName,
		player: battle.master,
		master: battle.player,
		status: battle.status === 'won' ? 'lost' : 'won',
		// The card ids belong to the other player's team; this view owns none.
		playerCardIds: [],
		log,
	}
}

/**
 * The Pokemon an account would lead a duel with, by Pokedex id.
 *
 * Sent with the acceptance so both clients can play the opening — two
 * trainers walking on and throwing their first ball — while the script is
 * still being written. It is the same choice `fight` makes a moment later:
 * the active team, minus whoever is in no state to stand up. Null when there
 * is nothing to send out, in which case the opening simply skips the throw
 * rather than guessing a Pokemon the duel will not field.
 */
export function leadOf(userId: string): number | null {
	const teamId = getActiveTeamId(userId)
	const team = teamId ? getTeam(userId, teamId) : null
	if (!team) return null

	const roster = fieldable(entrantsOf(team.members))
	return roster[0]?.pokedexId ?? null
}
