import { Router } from 'express'

import { requireAuth } from '../auth/middleware'
import { admitCards, careState } from '../care/center'

export const CareController = Router()

CareController.use(requireAuth)

/** The team's condition, and what treating it would cost in time. */
CareController.get('/', (req, res) => {
	return res.status(200).json({ care: careState(req.user!.id) })
})

/**
 * Leave the wounded at the centre.
 *
 * With no `cardIds`, the whole active team's wounded are taken in. The moment
 * each one is ready is decided here and nowhere else.
 */
CareController.post('/admit', (req, res) => {
	const raw = req.body?.cardIds
	if (raw !== undefined && (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string'))) {
		return res
			.status(400)
			.json({ error: { code: 'INVALID_PAYLOAD', message: 'cardIds doit être une liste d’identifiants' } })
	}

	const outcome = admitCards(req.user!.id, raw as string[] | undefined)
	if (outcome.ok) {
		return res.status(200).json({ ...outcome.result, care: careState(req.user!.id) })
	}

	const messages = {
		NO_CENTER: 'Aucun centre de soins sur cette carte',
		TOO_FAR: 'Tu dois être au centre de soins pour y laisser ton équipe',
		NOTHING_TO_TREAT: 'Personne à soigner',
		NOT_OWNED: 'Une de ces cartes ne t’appartient pas',
	}

	const status = outcome.reason === 'TOO_FAR' ? 403 : outcome.reason === 'NO_CENTER' ? 404 : 409
	return res.status(status).json({ error: { code: outcome.reason, message: messages[outcome.reason] } })
})
