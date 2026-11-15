/**
 * Realtime contract shared by the server and the web app.
 *
 * ⚠️ Mirrored from `backend/src/realtime/events.ts` — there is no shared package
 * in this repo, so any change there must be copied here (and vice versa).
 */

import type { Battle } from '../battle'
import type { XpGain } from '../progression'
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

export type EncounterKind = 'duel' | 'trade'

/** An offer to duel or to trade, from the player standing next to you. */
export interface Invitation {
	id: string
	kind: EncounterKind
	fromUserId: string
	fromName: string
}

/** One card on a trading table. */
export interface TradeCard {
	cardId: string
	pokedexId: number
	name: string
	rarity: string
	level: number
	health: number
}

export interface TradeSide {
	userId: string
	name: string
	offer: TradeCard[]
	confirmed: boolean
}

/** A trade, as both players see it. */
export interface TradeState {
	id: string
	sides: [TradeSide, TradeSide]
	settled: boolean
}

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
	| 'INVALID_PAYLOAD'
	| 'UNAUTHORIZED'
	| 'NOT_IN_WORLD'
	| 'TOO_FAR'
	| 'NO_TEAM'
	| 'NO_HEALTHY_TEAM'
	| 'NOT_OWNED'
	| 'NO_SESSION'
	| 'BUSY'
	| 'TOO_MANY'
	/** A duel that was accepted but could not be resolved at all. */
	| 'DUEL_FAILED'

export interface RealtimeError {
	code: RealtimeErrorCode
	message: string
}

/** Ack payload: either the operation succeeded with data, or it failed. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: RealtimeError }

/* ------------------------------- client → server ------------------------------- */

export interface ClientToServerEvents {
	/* -------------------------------- encounters -------------------------------- */

	'pvp:invite': (
		payload: { toUserId: string; kind: EncounterKind },
		ack: (res: Ack<{ invitationId: string }>) => void,
	) => void
	'pvp:respond': (payload: { invitationId: string; accept: boolean }, ack?: (res: Ack<null>) => void) => void

	'trade:offer': (payload: { cardIds: string[] }, ack?: (res: Ack<null>) => void) => void
	'trade:confirm': (payload: { confirmed: boolean }, ack?: (res: Ack<null>) => void) => void
	'trade:leave': (ack?: (res: Ack<null>) => void) => void

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
	/* -------------------------------- encounters -------------------------------- */

	'pvp:invited': (invitation: Invitation) => void
	'pvp:cancelled': (payload: { invitationId: string; reason: string }) => void
	'pvp:error': (error: RealtimeError) => void
	/**
	 * The duel is on, and is being written.
	 *
	 * Sent to both players the moment the invitation is accepted, because the
	 * fight itself takes a few seconds: the chatbot writes the whole script
	 * before the first blow. Without this event the challenger's screen still
	 * read "waiting for <name>" all the way through, which is indistinguishable
	 * from an invitation nobody ever answered.
	 */
	'pvp:accepted': (payload: { opponentName: string }) => void
	/**
	 * A resolved duel, already written from *this* client's point of view: the
	 * reader is always the `player` side, so the battle components need to know
	 * nothing about who challenged whom.
	 */
	'pvp:duel': (payload: { battle: Battle; won: boolean; gains: XpGain[]; degraded: boolean }) => void

	'trade:state': (trade: TradeState) => void
	'trade:done': (trade: TradeState) => void
	'trade:closed': (payload: { reason: string }) => void

	/* ------------------------------ shared overworld ------------------------------ */

	'world:joined': (player: WorldPlayerState) => void
	/** Every accepted step, including our own — we reconcile on it. */
	'world:moved': (payload: { id: string; x: number; y: number; facing: Facing }) => void
	/** Our step was refused: snap back to this authoritative position. */
	'world:rejected': (payload: { x: number; y: number }) => void
	'world:left': (payload: { id: string }) => void
	'world:profile': (payload: { id: string; name: string; appearance: Appearance }) => void
}
