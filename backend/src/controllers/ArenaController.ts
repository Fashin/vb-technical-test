import { Router } from 'express'

import { requireAuth } from '../auth/middleware'
import { MASTERS } from '../arena/masters'
import { db } from '../db'

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
			defeated: victories.has(master.id),
			defeatedAt: victories.get(master.id) ?? null,
		}))

	return res.status(200).json({ masters })
})
