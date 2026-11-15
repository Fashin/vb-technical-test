import { randomUUID } from 'crypto'

import { resolveRounds, toFighter, type Side } from '../battle/engine'
import type { BattleState } from '../battle/battles'
import { recordWounds, type Wound } from '../care/healing'
import { grantXp, MAX_LEVEL, xpReward, type XpAward, type XpGain } from '../progression/levels'
import { getActiveTeamId, getTeam, type TeamMember } from '../teams/teams'
import { getMap, positionOf } from '../world/world'
import { findCamp, type Camp } from './camps'

/**
 * Training sessions.
 *
 * A session is one fight against wild Pokemon, resolved on the spot and never
 * stored: nothing here needs to survive a reload, and the arena's single
 * persisted battle stays the arena's. The chatbot is not involved either —
 * training is repeated dozens of times, so it has to be instant and free. The
 * engine improvises the moves and the lines itself (`battle/engine.ts`).
 *
 * Two rules shape everything below, and they work together:
 *
 *  - **only the Pokemon that fights earns**, paid for the knockouts it
 *    personally landed, as in the games. No experience is shared out.
 *  - **a camp only trains its own band**, and sends out its least-trained
 *    eligible member first. Without that second rule the first Pokemon would
 *    never faint once it outgrew the camp, so the rest of the team would never
 *    be sent out, never fight, and never earn a thing.
 *
 * The answer deliberately has the exact shape of an arena battle, so the web
 * app animates both with the same component.
 */

/** Wild Pokemon per session. Three is enough to feel like a fight. */
const WILD_COUNT = 3

/** How far the wild level may wander from the trainee's, in levels. */
const LEVEL_SPREAD = 2

/** How close to the camp's tile the player must stand, in tiles. */
const ENTRY_RANGE = 2

export interface CampProgress extends Camp {
	/** Tile the camp stands on, from the map the server generated. */
	x: number
	y: number
	/** Best level in the active team — what the camp measures you against. */
	teamLevel: number
	/** False while nothing in the team has reached this camp's floor. */
	unlocked: boolean
	/** True once nobody in the team falls inside the band: nothing left here. */
	exhausted: boolean
	/** True when the band is covered, but only by Pokémon at the centre. */
	allInCare: boolean
	/** Who would be sent out next, which is the least-trained eligible member. */
	nextTrainee: { name: string; level: number } | null
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value))
}

/**
 * The level a camp can carry a Pokemon to.
 *
 * One past its own band, deliberately: a camp that stopped at its last level
 * would strand everyone just short of the next camp's floor, and the ladder
 * would have a dead rung between every pair of biomes. Finishing a camp is
 * exactly what makes the next one accept you.
 */
function ceilingOf(camp: Camp): number {
	return Math.min(MAX_LEVEL, camp.maxLevel + 1)
}

/**
 * The members this camp can teach, least-trained first.
 *
 * Being in the band is the whole eligibility rule: too low and the sparring
 * would be slaughter, too high and there is nothing left to learn. Sorting by
 * level is what rotates the team through the camp session after session.
 */
function traineesOf(members: TeamMember[], camp: Camp): TeamMember[] {
	const ceiling = ceilingOf(camp)
	return members
		.filter((member) => !member.inCare && !member.fainted)
		.filter((member) => member.level >= camp.minLevel && member.level < ceiling)
		.sort((a, b) => a.level - b.level || a.slot - b.slot)
}

function activeTeam(userId: string) {
	const teamId = getActiveTeamId(userId)
	return teamId ? getTeam(userId, teamId) : null
}

function campSite(campId: string): { x: number; y: number } | null {
	return getMap().camps.find((site) => site.id === campId) ?? null
}

/** The camps as this account sees them: the rules, plus where it stands in them. */
export function listCamps(userId: string): CampProgress[] {
	const team = activeTeam(userId)
	const members = team?.members ?? []
	const best = members.reduce((high, member) => Math.max(high, member.level), 0)

	return getMap()
		.camps.map((site) => {
			const camp = findCamp(site.id)
			if (!camp) return null

			const trainees = traineesOf(members, camp)
			const next = trainees[0]
			// Separating the two tells the player which message to act on: train
			// somewhere else, or go and collect your Pokémon.
			const sidelined = members.filter(
				(member) =>
					(member.inCare || member.fainted) &&
					member.level >= camp.minLevel &&
					member.level < ceilingOf(camp),
			)

			return {
				...camp,
				x: site.x,
				y: site.y,
				teamLevel: best,
				unlocked: best >= camp.minLevel,
				exhausted: members.length > 0 && trainees.length === 0 && sidelined.length === 0 && best >= camp.minLevel,
				allInCare: trainees.length === 0 && sidelined.length > 0,
				nextTrainee: next ? { name: next.name, level: next.level } : null,
			}
		})
		.filter((camp): camp is CampProgress => camp !== null)
}

export interface TrainingSession {
	campId: string
	campName: string
	/** The fight, in the arena's own shape so the client can reuse its player. */
	battle: BattleState
	/** Total experience the session handed out, across every fighter. */
	xpEarned: number
	/** One entry per Pokemon that fought — the bench is simply not here. */
	gains: XpGain[]
	/** Who led the session: the least-trained member the camp accepts. */
	trainee: string
	/** Levels this camp still teaches, echoed for the panel. */
	band: { min: number; max: number }
}

export type SessionResult =
	| { ok: true; session: TrainingSession }
	| {
			ok: false
			reason: 'CAMP_NOT_FOUND' | 'NO_TEAM' | 'TOO_FAR' | 'TOO_WEAK' | 'NOTHING_TO_LEARN' | 'NO_HEALTHY_TEAM'
			detail?: { minLevel: number; maxLevel: number; teamLevel: number }
	  }

/**
 * Train the active team once at a camp.
 *
 * Three checks before anything is rolled, in the order a player would meet
 * them: is there a team, is it standing at the camp, and does this camp have
 * anything to teach it. The position is read from the world the server itself
 * simulates, so entering a camp means actually having walked there.
 */
export async function runSession(userId: string, campId: string): Promise<SessionResult> {
	const camp = findCamp(campId)
	const site = campSite(campId)
	if (!camp || !site) return { ok: false, reason: 'CAMP_NOT_FOUND' }

	const team = activeTeam(userId)
	if (!team || team.members.length === 0) return { ok: false, reason: 'NO_TEAM' }

	const standing = positionOf(userId)
	if (!standing || Math.abs(standing.x - site.x) > ENTRY_RANGE || Math.abs(standing.y - site.y) > ENTRY_RANGE) {
		return { ok: false, reason: 'TOO_FAR' }
	}

	const best = team.members.reduce((high, member) => Math.max(high, member.level), 0)
	const detail = { minLevel: camp.minLevel, maxLevel: camp.maxLevel, teamLevel: best }

	// Nobody is strong enough to spar here at all.
	if (best < camp.minLevel) return { ok: false, reason: 'TOO_WEAK', detail }

	const trainees = traineesOf(team.members, camp)
	if (trainees.length === 0) {
		// Told apart on purpose: one of these is solved by walking to another
		// camp, the other by waiting at the healing centre.
		const sidelined = team.members.some(
			(member) =>
				(member.inCare || member.fainted) &&
				member.level >= camp.minLevel &&
				member.level < ceilingOf(camp),
		)
		return { ok: false, reason: sidelined ? 'NO_HEALTHY_TEAM' : 'NOTHING_TO_LEARN', detail }
	}

	/* ------------------------------- the fight ------------------------------- */

	// "At the current level": the sparring partners follow the trainee, kept
	// inside the band so a camp never fields opponents above its own tier.
	const target = clamp(trainees[0].level, camp.minLevel, camp.maxLevel)
	const wildLevel = () =>
		clamp(target + Math.round((Math.random() - 0.5) * 2 * LEVEL_SPREAD), camp.minLevel, camp.maxLevel)

	const [playerTeam, wildTeam] = await Promise.all([
		Promise.all(
			trainees.map(async (member) => {
				const fighter = await toFighter(member.pokedexId, member.level)
				// It walks in as it walked out of its last fight.
				fighter.hp = Math.max(1, Math.round(fighter.maxHp * member.health))
				return fighter
			}),
		),
		Promise.all(
			Array.from({ length: WILD_COUNT }, () => {
				const pokedexId = camp.wild[Math.floor(Math.random() * camp.wild.length)]
				return toFighter(pokedexId, wildLevel())
			}),
		),
	])

	const player: Side = { name: team.name, team: playerTeam, active: 0 }
	const wild: Side = { name: camp.name, team: wildTeam, active: 0 }

	const { rounds, winner, participants } = resolveRounds(player, wild, [])

	/* --------------------------------- payout -------------------------------- */

	/*
	 * Only the Pokemon that fought are paid, and they share what the session
	 * was worth equally.
	 *
	 * Paying the knockout itself — the mainline games' rule — was tried and is
	 * wrong here: the camp sends out its *least*-trained member, that member is
	 * the first to fall, and its stronger team mates finish the job and take
	 * everything. The one the session exists for would end up the only one
	 * never paid, and would lead every session thereafter. An equal share
	 * between whoever stood on the field keeps the rotation turning.
	 */
	const beaten = wildTeam.filter((fighter) => fighter.hp === 0)
	const purse = beaten.reduce((sum, fighter) => sum + xpReward(fighter.level), 0)
	const share = participants.player.length > 0 ? Math.floor(purse / participants.player.length) : 0

	const payout: XpAward[] = participants.player.map((index) => ({
		cardId: trainees[index].cardId,
		amount: share,
	}))
	const gains = grantXp(payout, ceilingOf(camp))
	const xpEarned = share * participants.player.length

	// Sparring is not free either: what the session costs stays lost until the
	// healing centre gives it back.
	const wounds: Wound[] = playerTeam.map((fighter, index) => ({
		cardId: trainees[index].cardId,
		lost: 1 - fighter.hp / fighter.maxHp,
	}))
	recordWounds(userId, wounds)

	const battle: BattleState = {
		id: randomUUID(),
		masterId: camp.id,
		masterName: camp.name,
		round: rounds.length,
		player,
		master: wild,
		status: winner === 'player' ? 'won' : 'lost',
		playerCardIds: trainees.map((member) => member.cardId),
		intro:
			`Entraînement au ${camp.name} : ${trainees[0].name} entre sur le terrain` +
			` face à ${WILD_COUNT} Pokémon sauvages de niveau ${target} !`,
		log: rounds,
		reward: null,
	}

	return {
		ok: true,
		session: {
			campId: camp.id,
			campName: camp.name,
			battle,
			xpEarned,
			gains,
			trainee: trainees[0].name,
			band: { min: camp.minLevel, max: camp.maxLevel },
		},
	}
}
