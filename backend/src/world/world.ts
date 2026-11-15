import { createRouteMap, layerOf, type TileMapData } from './mapData'
import { isSolid } from './tiles'
import { appearanceOf, findById, savePosition, type UserRow } from '../auth/users'
import type { Appearance } from '../appearance/appearance'

/**
 * The shared overworld, held in memory.
 *
 * Single-process only, exactly like `realtime/rooms.ts`: scaling out means
 * moving this state behind Redis and the socket.io redis adapter. Everything
 * else in the realtime layer talks to this module and would not change.
 */

/** Fixed seed: every player walks the same world. */
const WORLD_SEED = 1337

/** Tiles per second. Mirrored by the client for its animation — see events.ts. */
export const WORLD_SPEED = 6.5

/**
 * A step arriving sooner than this is dropped. The 0.8 factor is slack for
 * network jitter and frame timing: without it, honest clients get rejected on
 * a bad frame; with much more, a modified client walks noticeably fast.
 */
const STEP_TOLERANCE = 0.8

/** Position writes are throttled per player — one row per step would be silly. */
const SAVE_EVERY_MS = 3000

export type Facing = 'left' | 'right'

export interface WorldPlayer {
	/** Socket id: identifies the *connection*, which is what others track. */
	id: string
	userId: string
	name: string
	spriteId: number
	appearance: Appearance
	x: number
	y: number
	facing: Facing
	lastStepAt: number
	lastSavedAt: number
}

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

const map: TileMapData = createRouteMap(WORLD_SEED)
const players = new Map<string, WorldPlayer>()

const ground = layerOf(map, 'ground')
const objects = layerOf(map, 'objects')

export function getMap(): TileMapData {
	return map
}

export function canWalk(x: number, y: number): boolean {
	if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false
	const index = y * map.width + x
	return !isSolid(ground[index]) && !isSolid(objects[index])
}

export function toState(player: WorldPlayer): WorldPlayerState {
	const { id, userId, name, spriteId, appearance, x, y, facing } = player
	return { id, userId, name, spriteId, appearance, x, y, facing }
}

export function listPlayers(): WorldPlayerState[] {
	return [...players.values()].map(toState)
}

export function getPlayer(socketId: string): WorldPlayer | undefined {
	return players.get(socketId)
}

/**
 * Where an account currently stands.
 *
 * Reads the live world first and the last saved position second, so a feature
 * that must check "are you actually there" — entering a training camp — works
 * whether or not the socket happens to be connected. Returns null for an
 * account that has never walked anywhere.
 */
export function positionOf(userId: string): { x: number; y: number } | null {
	for (const player of players.values()) {
		if (player.userId === userId) return { x: player.x, y: player.y }
	}

	const user = findById(userId)
	if (!user || user.last_x === null || user.last_y === null) return null
	return { x: user.last_x, y: user.last_y }
}

/** Resume where the player left off, unless that tile is no longer walkable. */
function spawnFor(user: UserRow): { x: number; y: number } {
	const { last_x: x, last_y: y } = user
	if (x !== null && y !== null && canWalk(x, y)) return { x, y }
	return { ...map.spawn }
}

export function addPlayer(socketId: string, user: UserRow): WorldPlayer {
	const { x, y } = spawnFor(user)
	const player: WorldPlayer = {
		id: socketId,
		userId: user.id,
		name: user.display_name,
		spriteId: user.sprite_id,
		appearance: appearanceOf(user),
		x,
		y,
		facing: 'right',
		lastStepAt: 0,
		lastSavedAt: Date.now(),
	}
	players.set(socketId, player)
	return player
}

export function removePlayer(socketId: string): WorldPlayer | null {
	const player = players.get(socketId)
	if (!player) return null
	players.delete(socketId)
	savePosition(player.userId, player.x, player.y)
	return player
}

/**
 * Validate and apply one step.
 *
 * This is the authoritative copy of the walking rules the client also runs for
 * its own prediction (`web-app/src/map/Player.tsx`): one tile per axis, no
 * walking into a solid tile, and no cutting a corner between two solids. When
 * a diagonal is blocked the move slides along whichever axis is still open,
 * so a player hugging a tree line keeps moving instead of sticking.
 *
 * Returns the player when the position changed, or null when the step was
 * refused — the caller then tells that client to snap back.
 */
export function tryStep(socketId: string, dx: number, dy: number): WorldPlayer | null {
	const player = players.get(socketId)
	if (!player) return null

	const stepX = Math.sign(dx)
	const stepY = Math.sign(dy)
	if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
	if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return null
	if (stepX === 0 && stepY === 0) return null

	const length = Math.hypot(stepX, stepY)
	const now = Date.now()
	const minDelay = (1000 / WORLD_SPEED) * length * STEP_TOLERANCE
	if (now - player.lastStepAt < minDelay) return null

	const target = resolveStep(player.x, player.y, stepX, stepY)
	if (!target) return null

	player.x = target.x
	player.y = target.y
	if (stepX < 0) player.facing = 'left'
	if (stepX > 0) player.facing = 'right'
	player.lastStepAt = now

	if (now - player.lastSavedAt >= SAVE_EVERY_MS) {
		player.lastSavedAt = now
		savePosition(player.userId, player.x, player.y)
	}

	return player
}

function resolveStep(x: number, y: number, dx: number, dy: number): { x: number; y: number } | null {
	if (dx && dy) {
		if (canWalk(x + dx, y + dy) && canWalk(x + dx, y) && canWalk(x, y + dy)) {
			return { x: x + dx, y: y + dy }
		}
		if (canWalk(x + dx, y)) return { x: x + dx, y }
		if (canWalk(x, y + dy)) return { x, y: y + dy }
		return null
	}
	return canWalk(x + dx, y + dy) ? { x: x + dx, y: y + dy } : null
}

/**
 * Apply a profile change to every connection this account has open.
 *
 * Name and look travel together because they change the same thing for the
 * other players — the character they see walking past — and a single event
 * means they can never arrive half-applied.
 */
export function setProfile(userId: string, name: string, appearance: Appearance): WorldPlayer[] {
	const changed: WorldPlayer[] = []
	for (const player of players.values()) {
		if (player.userId !== userId) continue
		player.name = name
		player.appearance = appearance
		changed.push(player)
	}
	return changed
}

/** Flush every position — used when the process is shutting down. */
export function saveAllPositions(): void {
	for (const player of players.values()) savePosition(player.userId, player.x, player.y)
}
