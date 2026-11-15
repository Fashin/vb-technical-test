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
	return res.status(200).json({ camps: listCamps(req.user!.id) })
})

/** Train the active team once. The server decides what it meets and what it earns. */
TrainingController.post('/:campId/session', async (req, res) => {
	const result = await runSession(req.user!.id, req.params.campId)
	if (result.ok) return res.status(200).json(result.session)

	const messages: Record<typeof result.reason, string> = {
		CAMP_NOT_FOUND: 'Ce camp n’existe pas',
		NO_TEAM: 'Compose une équipe avant de t’entraîner',
		NO_HEALTHY_TEAM: 'Tes Pokémon de ce palier sont blessés ou en soins — passe par le centre de soins',
		TOO_FAR: 'Tu dois être sur le camp pour y entrer',
		TOO_WEAK: `Ce camp n’accepte qu’à partir du niveau ${result.detail?.minLevel}`,
		NOTHING_TO_LEARN: `Ton équipe a tout appris ici (plafond ${result.detail?.maxLevel}) — va au camp suivant`,
	}

	const status = result.reason === 'CAMP_NOT_FOUND' ? 404 : result.reason === 'TOO_FAR' ? 403 : 409
	return res.status(status).json({
		error: { code: result.reason, message: messages[result.reason], detail: result.detail ?? null },
	})
})
