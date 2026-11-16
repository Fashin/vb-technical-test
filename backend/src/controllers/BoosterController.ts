import { Router } from 'express'

import { requireAuth } from '../auth/middleware'
import { getState, listCards, openBooster, openLuckyBooster } from '../boosters/boosters'
import {
	MAX_LUCK,
	SHARDS_PER_BOOSTER,
	SHARD_VALUE,
	oddsTable,
	preview,
	transform,
} from '../boosters/recycle'

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

/* ------------------------------ Recycling -------------------------------- */

/**
 * What transforming the duplicates would cost and buy, plus the rules.
 *
 * The rates are served rather than hard-coded in the client: the panel
 * promises the player a number of packs and a bonus, and the only place that
 * can honestly state either is the module that applies them.
 */
BoosterController.get('/recycle', (req, res) => {
	return res.status(200).json({
		preview: preview(req.user!.id),
		rules: {
			shardValue: SHARD_VALUE,
			shardsPerBooster: SHARDS_PER_BOOSTER,
			maxLuck: MAX_LUCK,
			/** Odds at each luck step, so the panel can show what it is buying. */
			odds: Array.from({ length: MAX_LUCK + 1 }, (_, luck) => ({ luck, odds: oddsTable(luck) })),
		},
	})
})

/** Melt every eligible duplicate and mint the packs it pays for. */
BoosterController.post('/recycle', (req, res) => {
	const outcome = transform(req.user!.id)
	if (!outcome) {
		return res
			.status(409)
			.json({ error: { code: 'NO_DUPLICATES', message: 'Aucun doublon à transformer' } })
	}
	return res.status(200).json({ outcome, state: getState(req.user!.id) })
})

/** Open the best pack the recycled duplicates bought. */
BoosterController.post('/open-lucky', async (req, res) => {
	const result = await openLuckyBooster(req.user!.id)
	if (!result) {
		return res
			.status(409)
			.json({ error: { code: 'NO_LUCKY_BOOSTER', message: 'Aucun booster chanceux à ouvrir' } })
	}
	return res.status(200).json(result)
})
