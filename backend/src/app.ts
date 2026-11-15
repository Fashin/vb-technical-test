// First import on purpose: it loads `.env` before any module reads it.
import { CORS_ORIGINS, PORT, reportConfig } from './config'

import cors from 'cors'
import express from 'express'

import { createServer } from 'http'
import { AuthController } from './controllers/AuthController'
import { ArenaController } from './controllers/ArenaController'
import { BoosterController } from './controllers/BoosterController'
import { TeamController } from './controllers/TeamController'
import { TrainingController } from './controllers/TrainingController'
import { CareController } from './controllers/CareController'
import { RankingController } from './controllers/RankingController'
import { AchievementController } from './controllers/AchievementController'
import { PokemonController } from './controllers/PokemonController'
import { ContentController } from './controllers/ContentsController'
import { attachRealtime } from './realtime'
import { startSessionReaper } from './auth/sessions'
import { saveAllPositions } from './world/world'

/** App */
const app = express()

app.disable('x-powered-by')
const httpServer = createServer(app)

app.set('trust proxy', 1)

/**
 * Only the front-end's own origins, never a reflection of whatever asks.
 * Unknown origins are refused rather than echoed back.
 */
app.use(
	cors({
		origin: (origin, callback) => {
			// No Origin header at all: curl, a server-to-server call, same-origin.
			if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true)
			return callback(new Error('ORIGIN_NOT_ALLOWED'))
		},
		credentials: true,
	}),
)

/**
 * Body parser.
 *
 * 100 kB is comfortably more than this API's largest payload (a team of six
 * card ids). The boilerplate's 50 MB was a free denial-of-service: every
 * unauthenticated request could pin memory and CPU on parsing.
 */
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))

/**
 * Routes
 */
app.use('/auth', AuthController)
app.use('/boosters', BoosterController)
app.use('/arena', ArenaController)
app.use('/teams', TeamController)
app.use('/training', TrainingController)
app.use('/care', CareController)
app.use('/ranking', RankingController)
app.use('/achievements', AchievementController)
app.use('/pokemons', PokemonController)
app.use('/contents', ContentController)
app.get('/ping', (_req, res) => res.status(200).send('pong'))

/**
 * Last in the chain: anything thrown or rejected inside a handler ends here.
 *
 * Without it Express answers an unexpected error with its default page, stack
 * trace included. The cause is logged for the operator and the client is told
 * only that something failed.
 */
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	if (error.message === 'ORIGIN_NOT_ALLOWED') {
		return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed' } })
	}

	// Body-parser rejections already know what they are — an oversized body is
	// a 413 and malformed JSON a 400, not an internal failure. Honour the
	// status they carry rather than flattening everything to 500.
	const status = (error as { status?: number; statusCode?: number }).status ??
		(error as { statusCode?: number }).statusCode
	if (typeof status === 'number' && status >= 400 && status < 500) {
		const code = (error as { type?: string }).type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST'
		return res.status(status).json({ error: { code, message: 'Requête refusée' } })
	}

	console.error('[http] unhandled error:', error)
	return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } })
})

/**
 * Realtime (socket.io) arena, sharing this HTTP server so both live on :3001.
 */
attachRealtime(httpServer)

/** Expired sessions are swept at boot, then hourly. */
startSessionReaper()

/** Don't lose where everyone was standing on a restart. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		saveAllPositions()
		process.exit(0)
	})
}

/* -------------------------- Start the application ------------------------- */

/**
 * Start server
 */
httpServer.listen(PORT, () => {
	reportConfig()
	console.log('Server started on port:', PORT)
})