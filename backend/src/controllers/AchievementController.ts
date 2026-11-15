import { Router } from 'express'

import { achievementsFor } from '../achievements/achievements'
import { CATEGORY_LABELS } from '../achievements/catalogue'
import { requireAuth } from '../auth/middleware'

export const AchievementController = Router()

AchievementController.use(requireAuth)

/**
 * This account's achievements, derived on read.
 *
 * The category labels travel with them so the panel groups the list without
 * keeping its own copy of the catalogue's vocabulary.
 */
AchievementController.get('/', (req, res) => {
	return res.status(200).json({ ...achievementsFor(req.user!.id), categories: CATEGORY_LABELS })
})
