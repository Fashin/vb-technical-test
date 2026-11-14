/**
 * Realtime contract shared by the server and the web app.
 *
 * ⚠️ Mirrored in `web-app/src/realtime/events.ts` — there is no shared package
 * in this repo, so any change here must be copied there (and vice versa).
 */

import type { TileMapData } from '../world/mapData'
import type { Facing, WorldPlayerState } from '../world/world'

export type { TileMapData, TileLayer, LayerName } from '../world/mapData'
export type { Facing, WorldPlayerState } from '../world/world'

export type RoomPhase = 'lobby' | 'picking' | 'battle' | 'finished'

export interface PlayerState {
	id: string
	name: string
	/** Pokedex id of the fighter this player picked, null until they choose. */
	pokedexId: number | null
	ready: boolean
	connected: boolean
}

export interface RoomState {
	id: string
	phase: RoomPhase
	players: PlayerState[]
	/** Socket id of the player whose turn it is, null outside the battle phase. */
	turnPlayerId: string | null
	createdAt: number
}

export const MAX_PLAYERS_PER_ROOM = 2

/**
 * Everything the web app needs to draw the world the moment it joins: the map
 * itself (generated server-side, so there is one source of truth), the walking
 * speed it must animate at, who you are, and who else is already there.
 */
export interface WorldSnapshot {
	map: TileMapData
	/** Tiles per second — the server rejects steps that arrive faster. */
	speed: number
	you: WorldPlayerState
	players: WorldPlayerState[]
}

export type RealtimeErrorCode =
	| 'ROOM_NOT_FOUND'
	| 'ROOM_FULL'
	| 'ALREADY_IN_ROOM'
	| 'NOT_IN_ROOM'
	| 'INVALID_PAYLOAD'
	| 'UNAUTHORIZED'
	| 'NOT_IN_WORLD'

export interface RealtimeError {
	code: RealtimeErrorCode
	message: string
}

/** Ack payload: either the operation succeeded with data, or it failed. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: RealtimeError }

/* ------------------------------- client → server ------------------------------- */

export interface ClientToServerEvents {
	'room:create': (payload: { playerName: string }, ack: (res: Ack<RoomState>) => void) => void
	'room:join': (payload: { roomId: string; playerName: string }, ack: (res: Ack<RoomState>) => void) => void
	'room:leave': (ack?: (res: Ack<null>) => void) => void
	'room:pick': (payload: { pokedexId: number }, ack?: (res: Ack<RoomState>) => void) => void
	'room:ready': (payload: { ready: boolean }, ack?: (res: Ack<RoomState>) => void) => void

	/* ------------------------------ shared overworld ------------------------------ */

	/** Enter the world; the ack carries the map and everyone already walking it. */
	'world:join': (ack: (res: Ack<WorldSnapshot>) => void) => void
	/** One step, one tile per axis: `dx`/`dy` are each -1, 0 or 1. */
	'world:move': (payload: { dx: number; dy: number }) => void
	'world:leave': () => void
}

/* ------------------------------- server → client ------------------------------- */

export interface ServerToClientEvents {
	/** Authoritative room snapshot — the client renders this, it never guesses. */
	'room:state': (room: RoomState) => void
	'room:closed': (payload: { roomId: string; reason: string }) => void
	'room:error': (error: RealtimeError) => void
	/** Both players are ready: the arena takes over from here. */
	'battle:start': (room: RoomState) => void

	/* ------------------------------ shared overworld ------------------------------ */

	'world:joined': (player: WorldPlayerState) => void
	/** Every accepted step, including your own — the client reconciles on it. */
	'world:moved': (payload: { id: string; x: number; y: number; facing: Facing }) => void
	/** Your step was refused: snap back to this authoritative position. */
	'world:rejected': (payload: { x: number; y: number }) => void
	'world:left': (payload: { id: string }) => void
}

/** Per-socket server-side bookkeeping. */
export interface SocketData {
	roomId: string | null
	playerName: string
	/** Set by the handshake middleware; a socket without one is never connected. */
	userId: string
	inWorld: boolean
}

export type InterServerEvents = Record<string, never>
