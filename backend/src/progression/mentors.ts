import { MAX_LEVEL } from './levels'

/**
 * Mentoring: what a Pokémon that has topped out its band is still good for.
 *
 * A camp only fields its own band, so a Pokémon that reaches the band's
 * ceiling stops earning and sits out (`training/training.ts`). Up to here it
 * simply became useless to the team that carried it there, which is the wrong
 * reward for finishing a tier — and it made the last stretch of the game the
 * slowest: a fresh legendary pulled next to five level-100s had to walk the
 * whole ladder alone, at the pace of a level-5.
 *
 * So the ones that have nothing left to learn teach instead. Every team mate
 * **at or past the ceiling in play** mentors every team mate **below its own
 * level**, and the effect is cumulative: five maxed-out mentors are five
 * bonuses. It pays twice, because both of a trainee's costs are time —
 *
 *  - **experience**, by raising what a session pays the trainee,
 *  - **care**, by shortening the wait at the healing centre.
 *
 * The size of one mentor's contribution is driven by the **level gap** it is
 * closing, which is the whole point: coaching a team mate one level behind is
 * worth a nudge, dragging a level-5 up to a full level-100 roster is worth a
 * great deal. A late legendary is meant to catch up fast; two Pokémon
 * progressing side by side are not meant to shortcut each other.
 *
 * "The ceiling in play" is the caller's, and the two callers mean slightly
 * different things by it: a training session means the camp's ceiling, so
 * mentoring tracks the camp the team is actually standing in, while the
 * healing centre has no camp and means the account's own level cap
 * (`badges.levelCapForBadges`). Both are "the top of the current tier", which
 * is what a player reads off the training panel.
 */

/** A team mate that has nothing left to learn at the ceiling in play. */
export interface Mentor {
	cardId: string
	name: string
	level: number
}

/** What one mentor adds, as a share of the base, with no gap to close. */
const MENTOR_BASE = 0.15

/** What one mentor adds once the gap is `MENTOR_FULL_GAP` or wider. */
const MENTOR_MAX = 0.6

/**
 * Level gap at which a mentor is worth all it can be worth.
 *
 * Two camp bands. Below it the contribution grows with the gap; a wider gap
 * than that is already the "my team is finished, this one is starting from
 * nothing" case the cumulation is there for.
 */
const MENTOR_FULL_GAP = 40

/**
 * Ceiling on the whole bonus, as a share of the base.
 *
 * A team holds six, so the most mentors a trainee can have is five, and five
 * at full value come to exactly this — a finished roster is worth four
 * sessions in one, and mends its newcomer four times quicker. The cap is
 * therefore not what limits the intended case; it is the guard that keeps a
 * larger roster, should `TEAM_SIZE` ever grow, from turning a camp into a
 * single click.
 */
const MENTOR_TOTAL_MAX = 3

/** Shape every caller already has: team members, with their condition. */
interface Candidate {
	cardId: string
	name: string
	level: number
	inCare: boolean
	fainted: boolean
}

/**
 * The team mates that mentor rather than train, at this ceiling.
 *
 * Fit ones only, and for the same reason the camp benches the others: a
 * Pokémon at the healing centre is not with the team, and one that is down
 * cannot coach. Best first, which is the order a panel wants to print.
 */
export function mentorsAmong(members: Candidate[], ceiling: number): Mentor[] {
	const top = Math.min(MAX_LEVEL, Math.max(1, Math.round(ceiling)))
	return members
		.filter((member) => !member.inCare && !member.fainted && member.level >= top)
		.map((member) => ({ cardId: member.cardId, name: member.name, level: member.level }))
		.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
}

/** What one mentor `gap` levels above a trainee is worth, as a share. */
function contribution(gap: number): number {
	if (gap <= 0) return 0
	const reach = Math.min(1, gap / MENTOR_FULL_GAP)
	return MENTOR_BASE + (MENTOR_MAX - MENTOR_BASE) * reach
}

/**
 * The bonus `mentors` give a Pokémon at `level`, as a share of the base.
 *
 * 0 when nobody is above it — a mentor never boosts itself, and never boosts
 * a team mate it is level with. Cumulative across mentors, each weighted by
 * the gap it personally closes, and capped as a whole.
 */
export function mentorBonus(level: number, mentors: Mentor[]): number {
	const total = mentors.reduce((sum, mentor) => sum + contribution(mentor.level - level), 0)
	return Math.min(MENTOR_TOTAL_MAX, total)
}

/**
 * The same bonus as a multiplier, which is how both callers use it.
 *
 * Experience is multiplied by it; care time is divided by it. One number, so
 * a player who reads "× 2,4" on the training panel knows the trip to the
 * centre is 2,4 times shorter too.
 */
export function mentorFactor(level: number, mentors: Mentor[]): number {
	return 1 + mentorBonus(level, mentors)
}
