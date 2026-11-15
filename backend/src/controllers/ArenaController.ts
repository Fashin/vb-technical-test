import { Router } from 'express'

import { rateLimitUser, requireAuth } from '../auth/middleware'
import { MASTERS, masterLevel } from '../arena/masters'
import { forfeit, getActiveBattle, runBattle, startBattle } from '../battle/battles'
import { db } from '../db'
import { hasVirtualBrain } from '../config'
import { getTeam, getActiveTeamId } from '../teams/teams'

export const ArenaController = Router()

ArenaController.use(requireAuth)

/**
 * The roster, in difficulty order, with this player's progress folded in.
 *
 * A master stays listed once beaten — the arena is a ladder to re-run, not a
 * checklist that empties — but only the first win pays its reward.
 */
ArenaController.get('/masters', (req, res) => {
	const rows = db
		.prepare('SELECT master_id, defeated_at FROM master_victories WHERE user_id = ?')
		.all(req.user!.id) as { master_id: string; defeated_at: number }[]

	const victories = new Map(rows.map((row) => [row.master_id, row.defeated_at]))

	const masters = [...MASTERS]
		.sort((a, b) => a.tier - b.tier)
		.map((master) => ({
			...master,
			// Announced up front: walking into a level 90 team unprepared should
			// be a choice, not a surprise.
			level: masterLevel(master.tier),
			defeated: victories.has(master.id),
			defeatedAt: victories.get(master.id) ?? null,
		}))

	return res.status(200).json({ masters })
})


/* ---------------------------------- battles --------------------------------- */

/** The battle in progress, if any. Lets a reload drop straight back into it. */
ArenaController.get('/battle', (req, res) => {
	return res.status(200).json({ battle: getActiveBattle(req.user!.id), narrated: hasVirtualBrain() })
})

/**
 * Start a fight. The team is named by id rather than sent as a list of
 * Pokemon: the server reads what that team actually holds, so a client cannot
 * field cards it does not own.
 */
ArenaController.post('/battle', async (req, res) => {
	const masterId = typeof req.body?.masterId === 'string' ? req.body.masterId : ''
	const requested = typeof req.body?.teamId === 'string' ? req.body.teamId : getActiveTeamId(req.user!.id)

	const team = requested ? getTeam(req.user!.id, requested) : null
	if (!team) {
		return res.status(404).json({ error: { code: 'TEAM_NOT_FOUND', message: 'Choisis une équipe' } })
	}

	const result = await startBattle(
		req.user!.id,
		req.user!.display_name,
		masterId,
		team.members.map((member) => ({
			cardId: member.cardId,
			pokedexId: member.pokedexId,
			level: member.level,
			health: member.health,
			inCare: member.inCare,
		})),
	)

	if (result.ok) return res.status(201).json({ battle: result.battle, narrated: hasVirtualBrain() })

	const messages = {
		MASTER_NOT_FOUND: 'Ce maître n’existe pas',
		EMPTY_TEAM: 'Ton équipe est vide',
		ALREADY_FIGHTING: 'Un combat est déjà en cours',
		NO_HEALTHY_TEAM: 'Aucun Pokémon en état de combattre — passe par le centre de soins',
	}
	return res.status(result.reason === 'ALREADY_FIGHTING' ? 409 : 400).json({
		error: { code: result.reason, message: messages[result.reason] },
	})
})

/**
 * Resolving a battle asks the chatbot to write it, which costs real time and a
 * real API call. Six a minute is far more than playing needs and far less than
 * a script could spend.
 */
const battleLimiter = rateLimitUser(6, 60 * 1000)

/**
 * Resolve the battle, all of it.
 *
 * The chatbot is asked once for the whole script and the server plays it out,
 * so the browser gets a complete fight to animate in one piece rather than a
 * round per click. Everything that happens in it is decided here.
 */
ArenaController.post('/battle/run', battleLimiter, async (req, res) => {
	const result = await runBattle(req.user!.id)
	if (result.ok) {
		return res.status(200).json({ battle: result.battle, degraded: result.degraded })
	}
	return res.status(409).json({ error: { code: result.reason, message: 'Aucun combat en cours' } })
})

ArenaController.delete('/battle', (req, res) => {
	forfeit(req.user!.id)
	return res.status(204).end()
})
