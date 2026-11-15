import { Router } from 'express'

import { requireAuth } from '../auth/middleware'
import { getState, listCards, openBooster } from '../boosters/boosters'

export const BoosterController = Router()

BoosterController.use(requireAuth)

/** Current stock and the countdown to the next pack. */
BoosterController.get('/', (req, res) => {
	return res.status(200).json({ state: getState(req.user!.id) })
})

BoosterController.post('/open', async (req, res) => {
	const result = await openBooster(req.user!.id)
	if (!result) {
		return res
			.status(409)
			.json({ error: { code: 'NO_BOOSTER', message: 'Aucun booster à ouvrir pour le moment' } })
	}
	return res.status(200).json(result)
})

/** The collection, with the types and stats the panel filters and shows. */
BoosterController.get('/cards', async (req, res) => {
	return res.status(200).json({ cards: await listCards(req.user!.id) })
})
