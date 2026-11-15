import { Router } from 'express'

import { requireAuth } from '../auth/middleware'
import { leaderboard } from '../ranking/leaderboard'

export const RankingController = Router()

RankingController.use(requireAuth)

/**
 * The whole ranking, best first.
 *
 * `you` is sent alongside so the panel can highlight the reader's own row
 * without the client having to know which account it is logged in as.
 */
RankingController.get('/', (req, res) => {
	return res.status(200).json({ trainers: leaderboard(), you: req.user!.id })
})
