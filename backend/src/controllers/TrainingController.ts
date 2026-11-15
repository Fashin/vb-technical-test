import { Router } from 'express'

import { requireAuth } from '../auth/middleware'
import { listCamps, runSession } from '../training/training'

export const TrainingController = Router()

TrainingController.use(requireAuth)

/**
 * The five camps, with this account's standing in each.
 *
 * Positions come from the generated map rather than from a second table, so
 * the camps the client draws and the camps the server validates can never
 * drift apart.
 */
TrainingController.get('/camps', (req, res) => {
	// `teamId` is the team the player is considering, so the verdicts the panel
	// shows are about the team it has selected rather than the active one.
	const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined
	return res.status(200).json({ camps: listCamps(req.user!.id, teamId) })
})

/**
 * Train one team once. The server decides what it meets and what it earns.
 *
 * The team is named in the body; without one the active team walks in, which
 * is what the map's own shortcut does.
 */
TrainingController.post('/:campId/session', async (req, res) => {
	const body = (req.body ?? {}) as { teamId?: unknown }
	const teamId = typeof body.teamId === 'string' && body.teamId ? body.teamId : undefined

	const result = await runSession(req.user!.id, req.params.campId, teamId)
	if (result.ok) return res.status(200).json(result.session)

	const messages: Record<typeof result.reason, string> = {
		CAMP_NOT_FOUND: 'Ce camp n’existe pas',
		NO_TEAM: 'Compose une équipe avant de t’entraîner',
		TEAM_NOT_FOUND: 'Cette équipe n’existe plus',
		NO_HEALTHY_TEAM: 'Tes Pokémon de ce palier sont blessés ou en soins — passe par le centre de soins',
		TOO_FAR: 'Tu dois être sur le camp pour y entrer',
		TOO_WEAK: `Ce camp n’accepte qu’à partir du niveau ${result.detail?.minLevel}`,
	}

	const status =
		result.reason === 'CAMP_NOT_FOUND' || result.reason === 'TEAM_NOT_FOUND'
			? 404
			: result.reason === 'TOO_FAR'
				? 403
				: 409
	return res.status(status).json({
		error: { code: result.reason, message: messages[result.reason], detail: result.detail ?? null },
	})
})
