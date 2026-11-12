import type { Server as HttpServer } from 'http'
import { Server, type Socket } from 'socket.io'

import {
	type Ack,
	type ClientToServerEvents,
	type InterServerEvents,
	type RealtimeErrorCode,
	type RoomState,
	type ServerToClientEvents,
	type SocketData,
} from './events'
import {
	addPlayer,
	createRoom,
	everyoneReady,
	findPlayer,
	getRoom,
	isFull,
	listRooms,
	removePlayer,
	startBattle,
} from './rooms'

export type ArenaServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type ArenaSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

const ERROR_MESSAGES: Record<RealtimeErrorCode, string> = {
	ROOM_NOT_FOUND: 'No room with that code',
	ROOM_FULL: 'That room already has two players',
	ALREADY_IN_ROOM: 'You are already in a room',
	NOT_IN_ROOM: 'You are not in a room',
	INVALID_PAYLOAD: 'Invalid payload',
}

function fail(code: RealtimeErrorCode): Ack<never> {
	return { ok: false, error: { code, message: ERROR_MESSAGES[code] } }
}

function succeed<T>(data: T): Ack<T> {
	return { ok: true, data }
}

function sanitizeName(name: unknown): string | null {
	if (typeof name !== 'string') return null
	const trimmed = name.trim().slice(0, 24)
	return trimmed.length > 0 ? trimmed : null
}

/**
 * Attach the realtime arena layer to the existing HTTP server, so Express and
 * socket.io share port 3001 and the frontend needs no extra origin.
 */
export function attachRealtime(httpServer: HttpServer): ArenaServer {
	const io: ArenaServer = new Server(httpServer, {
		cors: { origin: true, credentials: true },
	})

	io.on('connection', (socket: ArenaSocket) => {
		socket.data.roomId = null
		socket.data.playerName = ''

		/** Push the authoritative snapshot to every player in the room. */
		const broadcast = (room: RoomState) => {
			io.to(room.id).emit('room:state', room)
		}

		socket.on('room:create', ({ playerName }, ack) => {
			if (socket.data.roomId) return ack(fail('ALREADY_IN_ROOM'))

			const name = sanitizeName(playerName)
			if (!name) return ack(fail('INVALID_PAYLOAD'))

			const room = createRoom(socket.id, name)
			socket.data.roomId = room.id
			socket.data.playerName = name
			void socket.join(room.id)

			ack(succeed(room))
			broadcast(room)
		})

		socket.on('room:join', ({ roomId, playerName }, ack) => {
			if (socket.data.roomId) return ack(fail('ALREADY_IN_ROOM'))

			const name = sanitizeName(playerName)
			if (!name || typeof roomId !== 'string') return ack(fail('INVALID_PAYLOAD'))

			const room = getRoom(roomId)
			if (!room) return ack(fail('ROOM_NOT_FOUND'))
			if (isFull(room)) return ack(fail('ROOM_FULL'))

			addPlayer(room, socket.id, name)
			socket.data.roomId = room.id
			socket.data.playerName = name
			void socket.join(room.id)

			ack(succeed(room))
			broadcast(room)
		})

		socket.on('room:pick', ({ pokedexId }, ack) => {
			const room = socket.data.roomId ? getRoom(socket.data.roomId) : undefined
			if (!room) return ack?.(fail('NOT_IN_ROOM'))

			const player = findPlayer(room, socket.id)
			if (!player) return ack?.(fail('NOT_IN_ROOM'))
			if (!Number.isInteger(pokedexId) || pokedexId < 1 || pokedexId > 898) {
				return ack?.(fail('INVALID_PAYLOAD'))
			}

			player.pokedexId = pokedexId
			ack?.(succeed(room))
			broadcast(room)
		})

		socket.on('room:ready', ({ ready }, ack) => {
			const room = socket.data.roomId ? getRoom(socket.data.roomId) : undefined
			if (!room) return ack?.(fail('NOT_IN_ROOM'))

			const player = findPlayer(room, socket.id)
			if (!player) return ack?.(fail('NOT_IN_ROOM'))
			if (typeof ready !== 'boolean') return ack?.(fail('INVALID_PAYLOAD'))
			if (player.pokedexId === null) return ack?.(fail('INVALID_PAYLOAD'))

			player.ready = ready
			ack?.(succeed(room))

			if (everyoneReady(room)) {
				startBattle(room)
				broadcast(room)
				io.to(room.id).emit('battle:start', room)
				return
			}
			broadcast(room)
		})

		socket.on('room:leave', (ack) => {
			const roomId = socket.data.roomId
			if (!roomId) return ack?.(fail('NOT_IN_ROOM'))

			const room = removePlayer(socket.id)
			void socket.leave(roomId)
			socket.data.roomId = null

			ack?.(succeed(null))
			if (room) broadcast(room)
			else io.to(roomId).emit('room:closed', { roomId, reason: 'empty' })
		})

		socket.on('disconnect', () => {
			const roomId = socket.data.roomId
			if (!roomId) return

			const room = removePlayer(socket.id)
			if (room) {
				broadcast(room)
				io.to(room.id).emit('room:closed', { roomId, reason: 'opponent-left' })
			}
		})
	})

	return io
}

export { listRooms }
