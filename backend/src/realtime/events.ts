/**
 * Realtime contract shared by the server and the web app.
 *
 * ⚠️ Mirrored in `web-app/src/realtime/events.ts` — there is no shared package
 * in this repo, so any change here must be copied there (and vice versa).
 */

import type { BattleState } from '../battle/battles'
import type { XpGain } from '../progression/levels'
import type { TileMapData } from '../world/mapData'
import type { Appearance } from '../appearance/appearance'
import type { Facing, WorldPlayerState } from '../world/world'

export type { TileMapData, TileLayer, LayerName } from '../world/mapData'
export type { Facing, WorldPlayerState } from '../world/world'
export type { Appearance } from '../appearance/appearance'

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

export interface RealtimeError {
	code: RealtimeErrorCode
	message: string
}

/** Ack payload: either the operation succeeded with data, or it failed. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: RealtimeError }

/* ------------------------------- client → server ------------------------------- */

export interface ClientToServerEvents {
	/* -------------------------------- encounters -------------------------------- */

	/** Offer a duel or a trade to a player standing within reach. */
	'pvp:invite': (
		payload: { toUserId: string; kind: EncounterKind },
		ack: (res: Ack<{ invitationId: string }>) => void,
	) => void
	/** Answer an invitation. Declining simply drops it. */
	'pvp:respond': (payload: { invitationId: string; accept: boolean }, ack?: (res: Ack<null>) => void) => void

	/** Put cards on the trading table; any change clears both confirmations. */
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
	 * Ask the server to re-read this account's profile and tell everyone.
	 * Payload-free on purpose: the name and the look are saved over REST, and
	 * the server trusts the database, never the client.
	 */
	'world:profile': () => void
}

/* ------------------------------- server → client ------------------------------- */

export interface ServerToClientEvents {
	/* -------------------------------- encounters -------------------------------- */

	/** Someone next to you wants something. */
	'pvp:invited': (invitation: Invitation) => void
	/** An invitation you sent or received is no longer standing. */
	'pvp:cancelled': (payload: { invitationId: string; reason: string }) => void
	'pvp:error': (error: RealtimeError) => void
	/**
	 * A resolved duel, already written from *this* client's point of view: the
	 * reader is always the `player` side, so the battle components need to know
	 * nothing about who challenged whom.
	 */
	'pvp:duel': (payload: { battle: BattleState; won: boolean; gains: XpGain[]; degraded: boolean }) => void

	/** The trading table, after every change either side makes. */
	'trade:state': (trade: TradeState) => void
	'trade:done': (trade: TradeState) => void
	'trade:closed': (payload: { reason: string }) => void

	/* ------------------------------ shared overworld ------------------------------ */

	'world:joined': (player: WorldPlayerState) => void
	/** Every accepted step, including your own — the client reconciles on it. */
	'world:moved': (payload: { id: string; x: number; y: number; facing: Facing }) => void
	/** Your step was refused: snap back to this authoritative position. */
	'world:rejected': (payload: { x: number; y: number }) => void
	'world:left': (payload: { id: string }) => void
	'world:profile': (payload: { id: string; name: string; appearance: Appearance }) => void
}

/** Per-socket server-side bookkeeping. */
export interface SocketData {
	playerName: string
	/** Set by the handshake middleware; a socket without one is never connected. */
	userId: string
	inWorld: boolean
}

export type InterServerEvents = Record<string, never>
