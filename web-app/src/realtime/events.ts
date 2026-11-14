/**
 * Realtime contract shared by the server and the web app.
 *
 * ⚠️ Mirrored from `backend/src/realtime/events.ts` — there is no shared package
 * in this repo, so any change there must be copied here (and vice versa).
 */

import type { TileMapData } from '../map/mapData'
import type { Appearance } from '../trainer/appearance'

export type { TileMapData, TileLayer, LayerName } from '../map/mapData'
export type { Appearance } from '../trainer/appearance'

export type Facing = 'left' | 'right'

/** One character walking the shared overworld. `id` is the socket id. */
export interface WorldPlayerState {
	id: string
	userId: string
	name: string
	spriteId: number
	appearance: Appearance
	x: number
	y: number
	facing: Facing
}

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
 * Everything needed to draw the world the moment we join: the map itself
 * (generated server-side, so there is one source of truth), the walking speed
 * to animate at, who we are, and who else is already there.
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
	/**
	 * Ask the server to re-read our profile and tell everyone. Payload-free on
	 * purpose: name and look are saved over REST, and the server trusts the
	 * database, never the client.
	 */
	'world:profile': () => void
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
	/** Every accepted step, including our own — we reconcile on it. */
	'world:moved': (payload: { id: string; x: number; y: number; facing: Facing }) => void
	/** Our step was refused: snap back to this authoritative position. */
	'world:rejected': (payload: { x: number; y: number }) => void
	'world:left': (payload: { id: string }) => void
	'world:profile': (payload: { id: string; name: string; appearance: Appearance }) => void
}
