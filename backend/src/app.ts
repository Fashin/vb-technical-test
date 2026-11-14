
import cors from 'cors'
import express from 'express'

import { createServer } from 'http'
import { AuthController } from './controllers/AuthController'
import { BoosterController } from './controllers/BoosterController'
import { PokemonController } from './controllers/PokemonController'
import { ContentController } from './controllers/ContentsController'
import { attachRealtime, listRooms } from './realtime'
import { startSessionReaper } from './auth/sessions'
import { saveAllPositions } from './world/world'

/** App */
const app = express()

app.disable('x-powered-by')
const httpServer = createServer(app)

app.set('trust proxy', 1)
app.use(cors({
	origin: true,
	credentials: true,
	exposedHeaders: ['set-cookie']
}))

/**
 * Body parser
 */
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))

/**
 * Routes
 */
app.use('/auth', AuthController)
app.use('/boosters', BoosterController)
app.use('/pokemons', PokemonController)
app.use('/contents', ContentController)
app.get('/ping', (_req, res) => res.status(200).send('pong'))

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

/** Debug helper: current rooms held in memory. */
app.get('/realtime/rooms', (_req, res) => res.status(200).json({ rooms: listRooms() }))


/* -------------------------- Start the application ------------------------- */

/**
 * Start server
 */
const PORT = Number(process.env.PORT) || 3001

httpServer.listen(PORT, () => {
	console.log('Server started on port:', PORT)
})