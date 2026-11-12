/**
 * Realtime contract shared by the server and the web app.
 *
 * ⚠️ Mirrored from `backend/src/realtime/events.ts` — there is no shared package
 * in this repo, so any change there must be copied here (and vice versa).
 */

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

export type RealtimeErrorCode =
	| 'ROOM_NOT_FOUND'
	| 'ROOM_FULL'
	| 'ALREADY_IN_ROOM'
	| 'NOT_IN_ROOM'
	| 'INVALID_PAYLOAD'

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
}

/* ------------------------------- server → client ------------------------------- */

export interface ServerToClientEvents {
	/** Authoritative room snapshot — the client renders this, it never guesses. */
	'room:state': (room: RoomState) => void
	'room:closed': (payload: { roomId: string; reason: string }) => void
	'room:error': (error: RealtimeError) => void
	/** Both players are ready: the arena takes over from here. */
	'battle:start': (room: RoomState) => void
}
