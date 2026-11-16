import { Router } from 'express'

import { appearanceOf, findById } from '../auth/users'
import { requireAuth } from '../auth/middleware'
import { listCards } from '../boosters/boosters'

export const TrainerController = Router()

TrainerController.use(requireAuth)

/**
 * Another trainer's collection, read-only.
 *
 * Deliberately not an encounter. A duel and a trade both change what the two
 * players own, so they go through an invitation and through the socket; this
 * takes nothing and gives nothing, so it is a plain request and nobody has to
 * accept anything. Nothing here is secret either — the ranking already states
 * everyone's Pokedex count, their best level and their duels won, from the
 * very same tables.
 *
 * Open to any signed-in account rather than to whoever is standing next to
 * you: proximity is what makes an *interaction* fair, and there is no
 * interaction to be fair about. It also leaves the route usable from the
 * ranking, which is the other place a trainer's name is shown.
 *
 * The cards are the owner's own list, unfiltered: the panel that reads them
 * shows no action, so there is nothing in it to abuse.
 */
TrainerController.get('/:userId/collection', async (req, res) => {
	const owner = findById(req.params.userId)
	if (!owner) {
		return res.status(404).json({ error: { code: 'NO_TRAINER', message: 'Ce dresseur n’existe pas' } })
	}

	return res.status(200).json({
		trainer: {
			userId: owner.id,
			name: owner.display_name,
			appearance: appearanceOf(owner),
		},
		cards: await listCards(owner.id),
	})
})
