import { Router } from 'express'

import { requireAuth } from '../auth/middleware'
import {
	MAX_TEAMS,
	NAME_MAX,
	TEAM_SIZE,
	countTeams,
	createTeam,
	deleteTeam,
	getActiveTeamId,
	listTeams,
	renameTeam,
	setActiveTeam,
	setMembers,
} from '../teams/teams'

export const TeamController = Router()

TeamController.use(requireAuth)

function invalid(message: string) {
	return { error: { code: 'INVALID_PAYLOAD', message } }
}

function cleanName(raw: unknown): string {
	return typeof raw === 'string' ? raw.trim().slice(0, NAME_MAX) : ''
}

TeamController.get('/', (req, res) => {
	return res.status(200).json({
		teams: listTeams(req.user!.id),
		activeTeamId: getActiveTeamId(req.user!.id),
		maxTeams: MAX_TEAMS,
		teamSize: TEAM_SIZE,
	})
})

TeamController.post('/', (req, res) => {
	const name = cleanName(req.body?.name)
	if (!name) return res.status(400).json(invalid('Donne un nom à ton équipe'))

	if (countTeams(req.user!.id) >= MAX_TEAMS) {
		return res
			.status(409)
			.json({ error: { code: 'TOO_MANY_TEAMS', message: `${MAX_TEAMS} équipes au maximum` } })
	}

	const team = createTeam(req.user!.id, name)
	// A first team is useless if nothing selects it; the arena needs one.
	if (!getActiveTeamId(req.user!.id)) setActiveTeam(req.user!.id, team.id)

	return res.status(201).json({ team })
})

TeamController.put('/active', (req, res) => {
	const { teamId } = req.body ?? {}
	if (teamId !== null && typeof teamId !== 'string') return res.status(400).json(invalid('teamId invalide'))

	if (!setActiveTeam(req.user!.id, teamId)) {
		return res.status(404).json({ error: { code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable' } })
	}
	return res.status(200).json({ activeTeamId: teamId })
})

TeamController.put('/:teamId', (req, res) => {
	const name = cleanName(req.body?.name)
	if (!name) return res.status(400).json(invalid('Donne un nom à ton équipe'))

	if (!renameTeam(req.user!.id, req.params.teamId, name)) {
		return res.status(404).json({ error: { code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable' } })
	}
	return res.status(200).json({ name })
})

TeamController.delete('/:teamId', (req, res) => {
	if (!deleteTeam(req.user!.id, req.params.teamId)) {
		return res.status(404).json({ error: { code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable' } })
	}
	return res.status(204).end()
})

TeamController.put('/:teamId/members', (req, res) => {
	const raw = req.body?.cardIds
	if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string')) {
		return res.status(400).json(invalid('cardIds doit être une liste d’identifiants'))
	}

	const result = setMembers(req.user!.id, req.params.teamId, raw as string[])
	if (result.ok) return res.status(200).json({ team: result.team })

	if (result.reason === 'NOT_FOUND') {
		return res.status(404).json({ error: { code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable' } })
	}
	if (result.reason === 'TOO_MANY') {
		return res.status(400).json(invalid(`${TEAM_SIZE} Pokémon au maximum par équipe`))
	}
	return res.status(400).json(invalid('Une de ces cartes ne t’appartient pas'))
})
