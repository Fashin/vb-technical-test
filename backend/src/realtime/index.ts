import type { Server as HttpServer } from 'http'
import { Server, type Socket } from 'socket.io'

import {
	type Ack,
	type ClientToServerEvents,
	type InterServerEvents,
	type RealtimeErrorCode,
	type ServerToClientEvents,
	type SocketData,
} from './events'
import { verifySession } from '../auth/sessions'
import { appearanceOf, findById } from '../auth/users'
import {
	WORLD_SPEED,
	addPlayer as addWorldPlayer,
	getMap,
	getPlayer as getWorldPlayer,
	listPlayers,
	removePlayer as removeWorldPlayer,
	setProfile,
	toState,
	tryStep,
} from '../world/world'
import { fight, mirror } from '../pvp/duels'
import { forget, invite, take } from '../pvp/encounters'
import { close as closeTrade, confirm, open as openTrade, setOffer, type TradeSession } from '../pvp/trades'

export type ArenaServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type ArenaSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

const ERROR_MESSAGES: Record<RealtimeErrorCode, string> = {
	INVALID_PAYLOAD: 'Invalid payload',
	UNAUTHORIZED: 'Sign in again',
	NOT_IN_WORLD: 'You have not joined the world',
	TOO_FAR: 'Trop loin de ce dresseur',
	NO_TEAM: 'Compose une équipe avant de défier quelqu’un',
	NO_HEALTHY_TEAM: 'Aucun Pokémon en état de combattre — passe par le centre de soins',
	NOT_OWNED: 'Une de ces cartes ne t’appartient pas',
	NO_SESSION: 'Cet échange n’existe plus',
	BUSY: 'Une invitation est déjà en attente',
}

function fail(code: RealtimeErrorCode): Ack<never> {
	return { ok: false, error: { code, message: ERROR_MESSAGES[code] } }
}

function succeed<T>(data: T): Ack<T> {
	return { ok: true, data }
}

/** socket.io room holding everyone walking the shared overworld. */
const WORLD_ROOM = 'world'

/**
 * The running server, so HTTP handlers can act on live connections. Set by
 * `attachRealtime`; null before the server is up and in unit tests.
 */
let server: ArenaServer | null = null

/**
 * Kick every connection belonging to an account — used right after the
 * account is deleted, so its character does not keep walking around with no
 * row behind it.
 */
export async function disconnectUser(userId: string): Promise<void> {
	if (!server) return

	for (const socket of await server.fetchSockets()) {
		if (socket.data.userId !== userId) continue
		// Disconnecting is enough: the `disconnect` handler removes the player
		// from the world and tells everyone, exactly as for a closed tab.
		socket.disconnect(true)
	}
}

/**
 * Attach the realtime arena layer to the existing HTTP server, so Express and
 * socket.io share port 3001 and the frontend needs no extra origin.
 */
export function attachRealtime(httpServer: HttpServer): ArenaServer {
	const io: ArenaServer = new Server(httpServer, {
		cors: { origin: true, credentials: true },
	})
	server = io

	/**
	 * Every socket carries a session token in its handshake. Authentication
	 * happens once, here, so no handler below ever has to ask who is talking —
	 * and an anonymous client simply never gets a connection.
	 */
	io.use((socket, next) => {
		const token = socket.handshake.auth?.token
		const user = verifySession(typeof token === 'string' ? token : null)
		if (!user) return next(new Error('UNAUTHORIZED'))

		socket.data.userId = user.id
		socket.data.playerName = user.display_name
		next()
	})

	/** Drop the player from the world and tell the others, once. */
	const leaveWorld = (socket: ArenaSocket) => {
		if (!socket.data.inWorld) return
		socket.data.inWorld = false
		const left = removeWorldPlayer(socket.id)
		void socket.leave(WORLD_ROOM)
		if (left) io.to(WORLD_ROOM).emit('world:left', { id: left.id })
	}

	io.on('connection', (socket: ArenaSocket) => {
		socket.data.inWorld = false

		/* -------------------------------- encounters -------------------------------- */

		/** Every socket an account has open, so an encounter reaches both players. */
		const socketsOf = async (userId: string) =>
			(await io.fetchSockets()).filter((other) => other.data.userId === userId)

		const tell = async (userId: string, event: keyof ServerToClientEvents, payload: never) => {
			for (const other of await socketsOf(userId)) other.emit(event, payload)
		}

		socket.on('pvp:invite', ({ toUserId, kind }, ack) => {
			if (typeof toUserId !== 'string' || (kind !== 'duel' && kind !== 'trade')) {
				return ack(fail('INVALID_PAYLOAD'))
			}

			const result = invite(socket.data.userId, socket.data.playerName, toUserId, kind)
			if (!result.ok) return ack(fail(result.reason === 'TOO_FAR' ? 'TOO_FAR' : 'BUSY'))

			const { id, fromUserId, fromName } = result.invitation
			void tell(toUserId, 'pvp:invited', { id, kind, fromUserId, fromName } as never)
			return ack(succeed({ invitationId: id }))
		})

		socket.on('pvp:respond', ({ invitationId, accept }, ack) => {
			const invitation = take(invitationId, socket.data.userId)
			if (!invitation) return ack?.(fail('NO_SESSION'))

			if (!accept) {
				void tell(invitation.fromUserId, 'pvp:cancelled', { invitationId, reason: 'DECLINED' } as never)
				return ack?.(succeed(null))
			}

			const host = { userId: invitation.fromUserId, name: invitation.fromName }
			const guest = { userId: socket.data.userId, name: socket.data.playerName }

			if (invitation.kind === 'trade') {
				const session = openTrade(host, guest)
				for (const side of session.sides) void tell(side.userId, 'trade:state', session as never)
				return ack?.(succeed(null))
			}

			// A duel takes a few seconds to write, so the ack goes out first and
			// the result is pushed to both players once it is ready.
			ack?.(succeed(null))
			void (async () => {
				const result = await fight(host, guest)
				if (!result.ok) {
					const error = { code: result.reason, message: 'Le duel n’a pas pu avoir lieu' }
					void tell(host.userId, 'pvp:error', error as never)
					void tell(guest.userId, 'pvp:error', error as never)
					return
				}

				const { battle, winnerUserId, gains, degraded } = result.duel
				void tell(host.userId, 'pvp:duel', {
					battle,
					won: winnerUserId === host.userId,
					gains: gains[host.userId] ?? [],
					degraded,
				} as never)
				void tell(guest.userId, 'pvp:duel', {
					battle: mirror(battle, host.name),
					won: winnerUserId === guest.userId,
					gains: gains[guest.userId] ?? [],
					degraded,
				} as never)
			})()
		})

		/* ---------------------------------- trades ---------------------------------- */

		const pushTrade = (session: TradeSession, event: 'trade:state' | 'trade:done') => {
			for (const side of session.sides) void tell(side.userId, event, session as never)
		}

		socket.on('trade:offer', ({ cardIds }, ack) => {
			if (!Array.isArray(cardIds) || cardIds.some((id) => typeof id !== 'string')) {
				return ack?.(fail('INVALID_PAYLOAD'))
			}

			const result = setOffer(socket.data.userId, cardIds)
			if (!result.ok) return ack?.(fail(result.reason))

			pushTrade(result.session, 'trade:state')
			return ack?.(succeed(null))
		})

		socket.on('trade:confirm', ({ confirmed }, ack) => {
			const result = confirm(socket.data.userId, Boolean(confirmed))
			if (!result.ok) return ack?.(fail(result.reason === 'EMPTY' ? 'INVALID_PAYLOAD' : result.reason))

			pushTrade(result.session, result.done ? 'trade:done' : 'trade:state')
			return ack?.(succeed(null))
		})

		socket.on('trade:leave', (ack) => {
			const session = closeTrade(socket.data.userId)
			for (const side of session?.sides ?? []) {
				if (side.userId === socket.data.userId) continue
				void tell(side.userId, 'trade:closed', { reason: 'LEFT' } as never)
			}
			return ack?.(succeed(null))
		})

		socket.on('world:join', (ack) => {
			if (socket.data.inWorld) {
				const existing = getWorldPlayer(socket.id)
				if (existing) {
					return ack(succeed({ map: getMap(), speed: WORLD_SPEED, you: toState(existing), players: listPlayers() }))
				}
			}

			const user = findById(socket.data.userId)
			if (!user) return ack(fail('UNAUTHORIZED'))

			const player = addWorldPlayer(socket.id, user)
			socket.data.inWorld = true
			void socket.join(WORLD_ROOM)

			ack(succeed({ map: getMap(), speed: WORLD_SPEED, you: toState(player), players: listPlayers() }))
			// The joiner is already in the snapshot it just received.
			socket.to(WORLD_ROOM).emit('world:joined', toState(player))
		})

		socket.on('world:move', ({ dx, dy }) => {
			if (!socket.data.inWorld) return

			const moved = tryStep(socket.id, Number(dx), Number(dy))
			if (!moved) {
				// Out of bounds, into a tree, or too fast: the client predicted a
				// step that never happened, so hand it the real position back.
				const current = getWorldPlayer(socket.id)
				if (current) socket.emit('world:rejected', { x: current.x, y: current.y })
				return
			}

			io.to(WORLD_ROOM).emit('world:moved', {
				id: moved.id,
				x: moved.x,
				y: moved.y,
				facing: moved.facing,
			})
		})

		/**
		 * The profile itself is saved and validated by the `/auth` routes; this
		 * only re-reads it from the database and tells the other players. There
		 * is no payload to trust — that is the point.
		 */
		socket.on('world:profile', () => {
			if (!socket.data.inWorld) return

			const user = findById(socket.data.userId)
			if (!user) return

			const appearance = appearanceOf(user)
			const name = user.display_name
			socket.data.playerName = name

			for (const player of setProfile(user.id, name, appearance)) {
				io.to(WORLD_ROOM).emit('world:profile', { id: player.id, name, appearance })
			}
		})

		socket.on('world:leave', () => {
			if (!socket.data.inWorld) return
			leaveWorld(socket)
		})

		socket.on('disconnect', () => {
			leaveWorld(socket)

			// Walking out ends whatever was pending: an invitation nobody can
			// answer, and a trading table with one chair left.
			for (const dropped of forget(socket.data.userId)) {
				const other = dropped.fromUserId === socket.data.userId ? dropped.toUserId : dropped.fromUserId
				void tell(other, 'pvp:cancelled', { invitationId: dropped.id, reason: 'LEFT' } as never)
			}

			const session = closeTrade(socket.data.userId)
			for (const side of session?.sides ?? []) {
				if (side.userId === socket.data.userId) continue
				void tell(side.userId, 'trade:closed', { reason: 'LEFT' } as never)
			}
		})
	})

	return io
}

