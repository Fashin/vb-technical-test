import { randomUUID } from 'crypto'

import { MAX_ROUNDS, resolveRounds, toFighter, type Side } from '../battle/engine'
import type { BattleState } from '../battle/battles'
import { recordWounds, type Wound } from '../care/healing'
import { grantXp, MAX_LEVEL, xpReward, type XpAward, type XpGain } from '../progression/levels'
import { getActiveTeamId, getTeam, type Team, type TeamMember } from '../teams/teams'
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
 * Three rules shape everything below, and they work together:
 *
 *  - **everyone the camp can teach spars**, one wild partner each, and a
 *    Pokemon hands over as soon as it has put its own partner down (`relay` in
 *    `battle/engine`). Without that hand-over only a faint would ever change
 *    who is out, so a team whose lead keeps winning would field exactly one
 *    Pokemon however many it brought.
 *  - **a camp only fields its own band.** Reaching the ceiling benches you and
 *    leaves the place to a team mate who can still learn here; so does being
 *    below the floor. A camp with nobody left in its band turns the team away
 *    — but one Pokemon crossing the ceiling never shuts it for the others.
 *  - **only the Pokemon that fights earns**, and the session's purse is split
 *    equally between those who stood on the field.
 *
 * Which team walks in is the player's choice: an explicit team, or the active
 * one when none is named.
 *
 * The answer deliberately has the exact shape of an arena battle, so the web
 * app animates both with the same component.
 */

/**
 * Sparring partners per session: one per Pokemon that walks in.
 *
 * Matching the roster is what makes the hand-over work out to one bout each.
 * Fewer partners and the fight would end before the back of the team ever
 * took the field; more and the front would have to fight twice.
 */
const wildCount = (roster: number): number => roster

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
	/** Who opens the session, which is the least-trained member it can teach. */
	nextTrainee: { name: string; level: number } | null
	/** How many Pokemon of this team would take the field — one bout each. */
	roster: number
	/** How many are fit but sit this camp out, having outgrown it or not reached it. */
	benched: number
	/**
	 * The highest level this camp can actually carry a Pokemon to.
	 *
	 * One past `maxLevel`, and stated rather than left for the client to work
	 * out: the band reads "1 – 25" while the camp teaches up to 26, and a
	 * player watching a level 25 reach 26 here is owed the real number.
	 */
	ceiling: number
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

/** Inside the band this camp teaches — the only thing that earns here. */
function teachable(member: TeamMember, camp: Camp): boolean {
	return member.level >= camp.minLevel && member.level < ceilingOf(camp)
}

/** Fit to fight at all. A Pokemon at the centre or fainted simply cannot. */
function available(member: TeamMember): boolean {
	return !member.inCare && !member.fainted
}

/**
 * Who walks in, least-trained first: the members this camp can teach.
 *
 * Only them. A Pokemon that has reached the ceiling stays on the bench and
 * leaves its place to one that can still learn here — which is the point of
 * walking to a camp rather than fighting anywhere. It also settles the
 * arithmetic: there is one sparring partner per Pokemon fielded, so a bench
 * that fought would be a bench taking wounds for experience it cannot earn.
 *
 * Being below the floor sits a Pokemon out too, for the opposite reason: the
 * sparring would be a slaughter, and a camp fields partners at its own tier.
 */
function squadOf(members: TeamMember[], camp: Camp): TeamMember[] {
	return members
		.filter(available)
		.filter((member) => teachable(member, camp))
		.sort((a, b) => a.level - b.level || a.slot - b.slot)
}

/** Fit to fight, but not here: on the bench for this camp. */
function benchedAt(members: TeamMember[], camp: Camp): TeamMember[] {
	return members.filter(available).filter((member) => !teachable(member, camp))
}

/**
 * The team a session runs with: the one named, or the active one.
 *
 * `null` for a team id that is not this account's — a caller cannot borrow
 * someone else's roster by guessing an id.
 */
function sessionTeam(userId: string, teamId?: string): Team | null {
	if (teamId) return getTeam(userId, teamId)
	const active = getActiveTeamId(userId)
	return active ? getTeam(userId, active) : null
}

function campSite(campId: string): { x: number; y: number } | null {
	return getMap().camps.find((site) => site.id === campId) ?? null
}

/**
 * The camps as this account sees them: the rules, plus where it stands in them.
 *
 * Measured against the team under consideration, so the panel's verdicts match
 * the team the player has actually picked in the selector.
 */
export function listCamps(userId: string, teamId?: string): CampProgress[] {
	const team = sessionTeam(userId, teamId)
	const members = team?.members ?? []
	const best = members.reduce((high, member) => Math.max(high, member.level), 0)

	return getMap()
		.camps.map((site) => {
			const camp = findCamp(site.id)
			if (!camp) return null

			const squad = squadOf(members, camp)
			const next = squad[0]
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
				exhausted: members.length > 0 && squad.length === 0 && sidelined.length === 0 && best >= camp.minLevel,
				allInCare: squad.length === 0 && sidelined.length > 0,
				nextTrainee: next ? { name: next.name, level: next.level } : null,
				roster: squad.length,
				benched: benchedAt(members, camp).length,
				ceiling: ceilingOf(camp),
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
	/** Who opened the session: the least-trained member the camp accepts. */
	trainee: string
	/** The team that walked in, so the panel can name it back. */
	teamId: string
	teamName: string
	/** Levels this camp accepts, and the level it can carry a Pokemon to. */
	band: { min: number; max: number; ceiling: number }
}

export type SessionResult =
	| { ok: true; session: TrainingSession }
	| {
			ok: false
			reason:
				| 'CAMP_NOT_FOUND'
				| 'NO_TEAM'
				| 'TEAM_NOT_FOUND'
				| 'TOO_FAR'
				| 'TOO_WEAK'
				| 'NOTHING_TO_LEARN'
				| 'NO_HEALTHY_TEAM'
			detail?: { minLevel: number; maxLevel: number; teamLevel: number }
	  }

/**
 * Train one team once at a camp.
 *
 * `teamId` is the team the player picked; without one the active team walks
 * in. Four checks before anything is rolled, in the order a player would meet
 * them: does the team exist and hold anyone, is the player standing at the
 * camp, has anyone reached the camp's floor, and is anyone fit to fight. The
 * position is read from the world the server itself simulates, so entering a
 * camp means actually having walked there.
 *
 * Note what is *not* a check: having outgrown the camp. See below.
 */
export async function runSession(userId: string, campId: string, teamId?: string): Promise<SessionResult> {
	const camp = findCamp(campId)
	const site = campSite(campId)
	if (!camp || !site) return { ok: false, reason: 'CAMP_NOT_FOUND' }

	// Told apart on purpose: a named team that does not exist is a stale panel
	// or a forged id, not an account that has yet to compose a team.
	if (teamId && !getTeam(userId, teamId)) return { ok: false, reason: 'TEAM_NOT_FOUND' }

	const team = sessionTeam(userId, teamId)
	if (!team || team.members.length === 0) return { ok: false, reason: 'NO_TEAM' }

	const standing = positionOf(userId)
	if (!standing || Math.abs(standing.x - site.x) > ENTRY_RANGE || Math.abs(standing.y - site.y) > ENTRY_RANGE) {
		return { ok: false, reason: 'TOO_FAR' }
	}

	const best = team.members.reduce((high, member) => Math.max(high, member.level), 0)
	const detail = { minLevel: camp.minLevel, maxLevel: camp.maxLevel, teamLevel: best }

	// Nobody is strong enough to spar here at all.
	if (best < camp.minLevel) return { ok: false, reason: 'TOO_WEAK', detail }

	/*
	 * One Pokemon reaching the ceiling must not shut the camp for its team.
	 *
	 * It used to: the session was refused as soon as anybody was missing from
	 * the band. Now whoever has outgrown the place simply sits out, and the
	 * session runs for the rest. Only a squad with nobody left to field stops
	 * it — and the two ways that happens are told apart, because one is solved
	 * by walking to another camp and the other by waiting at the centre.
	 */
	const squad = squadOf(team.members, camp)
	if (squad.length === 0) {
		const sidelined = team.members.some(
			(member) => (member.inCare || member.fainted) && teachable(member, camp),
		)
		return { ok: false, reason: sidelined ? 'NO_HEALTHY_TEAM' : 'NOTHING_TO_LEARN', detail }
	}

	/* ------------------------------- the fight ------------------------------- */

	const wilds = wildCount(squad.length)

	// "At the current level": the sparring partners follow the Pokemon that
	// opens — the least-trained of those this camp can teach — kept inside the
	// band so a camp never fields opponents above its own tier.
	const target = clamp(squad[0].level, camp.minLevel, camp.maxLevel)
	const wildLevel = () =>
		clamp(target + Math.round((Math.random() - 0.5) * 2 * LEVEL_SPREAD), camp.minLevel, camp.maxLevel)

	const [playerTeam, wildTeam] = await Promise.all([
		Promise.all(
			squad.map(async (member) => {
				const fighter = await toFighter(member.pokedexId, member.level)
				// It walks in as it walked out of its last fight.
				fighter.hp = Math.max(1, Math.round(fighter.maxHp * member.health))
				return fighter
			}),
		),
		Promise.all(
			Array.from({ length: wilds }, () => {
				const pokedexId = camp.wild[Math.floor(Math.random() * camp.wild.length)]
				return toFighter(pokedexId, wildLevel())
			}),
		),
	])

	const player: Side = { name: team.name, team: playerTeam, active: 0 }
	const wild: Side = { name: camp.name, team: wildTeam, active: 0 }

	// `relay` is what gives each Pokemon its own bout; the longer leash is what
	// lets the back of a full team reach the field before the cap.
	const { rounds, winner, participants } = resolveRounds(player, wild, [], {
		relay: true,
		maxRounds: Math.max(MAX_ROUNDS, wilds * 6),
	})

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
		cardId: squad[index].cardId,
		amount: share,
	}))
	const gains = grantXp(payout, ceilingOf(camp))
	// Summed from what was actually credited, not from what was offered: a
	// Pokemon past the camp's ceiling is paid nothing, and a session where
	// everyone has outgrown the place must report zero rather than a figure
	// nobody received.
	const xpEarned = gains.reduce((total, gain) => total + gain.gained, 0)

	// Sparring is not free either: what the session costs stays lost until the
	// healing centre gives it back.
	const wounds: Wound[] = playerTeam.map((fighter, index) => ({
		cardId: squad[index].cardId,
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
		playerCardIds: squad.map((member) => member.cardId),
		intro:
			`Entraînement au ${camp.name} : ${team.name} entre sur le terrain, ${squad[0].name} en tête,` +
			` face à ${wilds} Pokémon sauvage${wilds > 1 ? 's' : ''} de niveau ${target} !`,
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
			trainee: squad[0].name,
			teamId: team.id,
			teamName: team.name,
			band: { min: camp.minLevel, max: camp.maxLevel, ceiling: ceilingOf(camp) },
		},
	}
}
