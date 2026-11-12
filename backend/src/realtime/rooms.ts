import { randomBytes } from 'crypto'

import { MAX_PLAYERS_PER_ROOM, type PlayerState, type RoomState } from './events'

/**
 * In-memory room registry. Single-process only: if the backend is ever scaled
 * out, swap this for Redis (see socket.io's redis adapter) — the rest of the
 * realtime layer talks to this module and would not change.
 */
const rooms = new Map<string, RoomState>()

/** Short, readable, case-insensitive code players can type to each other. */
function generateRoomId(): string {
	let id: string
	do {
		id = randomBytes(3).toString('hex').toUpperCase()
	} while (rooms.has(id))
	return id
}

function createPlayer(socketId: string, name: string): PlayerState {
	return { id: socketId, name, pokedexId: null, ready: false, connected: true }
}

export function createRoom(socketId: string, playerName: string): RoomState {
	const room: RoomState = {
		id: generateRoomId(),
		phase: 'lobby',
		players: [createPlayer(socketId, playerName)],
		turnPlayerId: null,
		createdAt: Date.now(),
	}
	rooms.set(room.id, room)
	return room
}

export function getRoom(roomId: string): RoomState | undefined {
	return rooms.get(roomId.toUpperCase())
}

export function isFull(room: RoomState): boolean {
	return room.players.length >= MAX_PLAYERS_PER_ROOM
}

export function addPlayer(room: RoomState, socketId: string, playerName: string): RoomState {
	room.players.push(createPlayer(socketId, playerName))
	if (isFull(room)) room.phase = 'picking'
	return room
}

export function removePlayer(socketId: string): RoomState | null {
	for (const room of rooms.values()) {
		const index = room.players.findIndex((p) => p.id === socketId)
		if (index === -1) continue

		room.players.splice(index, 1)
		if (room.players.length === 0) {
			rooms.delete(room.id)
			return null
		}
		// A battle cannot continue one-sided: fall back to the lobby.
		room.phase = 'lobby'
		room.turnPlayerId = null
		room.players.forEach((p) => { p.ready = false })
		return room
	}
	return null
}

export function findPlayer(room: RoomState, socketId: string): PlayerState | undefined {
	return room.players.find((p) => p.id === socketId)
}

/** Everyone present picked a fighter and pressed ready. */
export function everyoneReady(room: RoomState): boolean {
	return (
		room.players.length === MAX_PLAYERS_PER_ROOM &&
		room.players.every((p) => p.ready && p.pokedexId !== null)
	)
}

export function startBattle(room: RoomState): RoomState {
	room.phase = 'battle'
	// Fastest Pokemon should open; stats are not known here yet, so first player
	// starts until the battle engine overrides it.
	room.turnPlayerId = room.players[0]?.id ?? null
	return room
}

/** Exposed for the /realtime/rooms debug route and for tests. */
export function listRooms(): RoomState[] {
	return [...rooms.values()]
}
