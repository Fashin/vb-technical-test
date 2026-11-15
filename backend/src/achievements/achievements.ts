import { db } from '../db'
import { levelFromXp } from '../progression/levels'
import { ACHIEVEMENTS, LEGENDARIES, type Achievement } from './catalogue'

/**
 * What a trainer has actually done, measured against the catalogue.
 *
 * Nothing is stored per player: every achievement is derived, on read, from
 * the tables that already record the facts — victories, cards, experience,
 * duels, trades. The same reasoning as the ranking (`ranking/leaderboard.ts`):
 * a derived standing cannot drift from reality, and no write path has to
 * remember to unlock anything.
 *
 * One pass over the player's facts, then one pure mapping per achievement.
 */

export interface UnlockedAchievement extends Achievement {
	unlocked: boolean
	/** How far along, against `target`. */
	progress: number
	/** When it was earned, when the underlying table knows — null otherwise. */
	unlockedAt: number | null
}

export interface AchievementSummary {
	achievements: UnlockedAchievement[]
	unlocked: number
	total: number
}

interface Facts {
	masters: Map<string, number>
	cards: number
	dexOwned: number
	legendaries: number
	bestLevel: number
	biggestTeam: number
	duels: number
	trades: number
}

function factsFor(userId: string): Facts {
	const victories = db
		.prepare('SELECT master_id, defeated_at FROM master_victories WHERE user_id = ?')
		.all(userId) as { master_id: string; defeated_at: number }[]

	const counts = db
		.prepare(
			`SELECT COUNT(*) AS cards,
			        COUNT(DISTINCT pokedex_id) AS dex,
			        COALESCE(MAX(xp), 0) AS best_xp
			 FROM cards WHERE user_id = ?`,
		)
		.get(userId) as { cards: number; dex: number; best_xp: number }

	const placeholders = LEGENDARIES.map(() => '?').join(', ')
	const legendaries = db
		.prepare(
			`SELECT COUNT(DISTINCT pokedex_id) AS owned FROM cards
			 WHERE user_id = ? AND pokedex_id IN (${placeholders})`,
		)
		.get(userId, ...LEGENDARIES) as { owned: number }

	const team = db
		.prepare(
			`SELECT COALESCE(MAX(size), 0) AS biggest FROM (
			   SELECT COUNT(*) AS size FROM team_members m
			   JOIN teams t ON t.id = m.team_id
			   WHERE t.user_id = ? GROUP BY m.team_id
			 )`,
		)
		.get(userId) as { biggest: number }

	const duels = db.prepare('SELECT COUNT(*) AS won FROM duels WHERE winner_id = ?').get(userId) as { won: number }

	// Counted by trade, not by card: one swap of three cards is one trade.
	const trades = db
		.prepare('SELECT COUNT(DISTINCT trade_id) AS done FROM trades WHERE giver_id = ? OR taker_id = ?')
		.get(userId, userId) as { done: number }

	return {
		masters: new Map(victories.map((row) => [row.master_id, row.defeated_at])),
		cards: counts.cards,
		dexOwned: counts.dex,
		legendaries: legendaries.owned,
		bestLevel: counts.cards > 0 ? levelFromXp(counts.best_xp) : 0,
		biggestTeam: team.biggest,
		duels: duels.won,
		trades: trades.done,
	}
}

/** How far along one achievement is, and when it was earned if anyone knows. */
function measure(achievement: Achievement, facts: Facts): { progress: number; at: number | null } {
	const { id } = achievement

	if (id.startsWith('master:')) {
		const masterId = id.slice('master:'.length)
		const at = facts.masters.get(masterId) ?? null
		return { progress: at === null ? 0 : 1, at }
	}

	if (id.startsWith('camp:')) return { progress: facts.bestLevel, at: null }

	switch (id) {
		case 'arena:all':
			return { progress: facts.masters.size, at: null }
		case 'dex:first':
		case 'cards:fifty':
		case 'cards:hundred':
			return { progress: facts.cards, at: null }
		case 'dex:half':
		case 'dex:complete':
			return { progress: facts.dexOwned, at: null }
		case 'dex:legendaries':
			return { progress: facts.legendaries, at: null }
		case 'team:full':
			return { progress: facts.biggestTeam, at: null }
		case 'duel:first':
		case 'duel:five':
			return { progress: facts.duels, at: null }
		case 'trade:first':
			return { progress: facts.trades, at: null }
		default:
			return { progress: 0, at: null }
	}
}

export function achievementsFor(userId: string): AchievementSummary {
	const facts = factsFor(userId)

	const achievements = ACHIEVEMENTS.map((achievement): UnlockedAchievement => {
		const { progress, at } = measure(achievement, facts)
		const capped = Math.min(progress, achievement.target)

		return {
			...achievement,
			progress: capped,
			unlocked: progress >= achievement.target,
			unlockedAt: at,
		}
	})

	return {
		achievements,
		unlocked: achievements.filter((achievement) => achievement.unlocked).length,
		total: achievements.length,
	}
}

/** Just the tally, for the ranking. */
export function countUnlocked(userId: string): number {
	return achievementsFor(userId).unlocked
}
