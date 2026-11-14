import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { NearestFilter, Vector3, type Group } from 'three'

import { layerOf, type TileMapData } from './mapData'
import { isSolid } from './tileset'
import type { Direction } from './usePlayerControls'

/**
 * Fallback walking speed, in tiles per second. The real value comes from the
 * server in `world:welcome`: it is the same number the server uses to reject
 * steps that arrive too fast, so the two must not drift.
 */
const DEFAULT_SPEED = 6.5
/** Same forward nudge as the object billboards, so depth sorting agrees. */
const Z_OFFSET = 0.9

const STEP: Record<Direction, [number, number]> = {
	up: [0, -1],
	down: [0, 1],
	left: [-1, 0],
	right: [1, 0],
}

interface Step {
	x: number
	y: number
}

/**
 * Combines the keys currently down into one step, one axis each: holding Left
 * and Up walks north-west. `held` is ordered most-recent-first, so a third key
 * never overrides the axis its neighbour already owns.
 */
function intentOf(held: Direction[], tapped: Direction | null): { dx: number; dy: number } {
	let dx = 0
	let dy = 0
	for (const direction of held) {
		const [sx, sy] = STEP[direction]
		if (sx && !dx) dx = sx
		if (sy && !dy) dy = sy
	}
	// A tap shorter than one frame leaves nothing held; honour it on its own.
	if (!dx && !dy && tapped) [dx, dy] = STEP[tapped]
	return { dx, dy }
}

export interface PlayerProps {
	map: TileMapData
	held: MutableRefObject<Direction[]>
	tapped: MutableRefObject<Direction | null>
	spriteUrl: string
	start?: { x: number; y: number }
	/**
	 * Written with the character's world position on every frame, so the camera
	 * rig can follow it without re-rendering React.
	 */
	tracker?: MutableRefObject<Vector3>
	/** Tiles per second, as announced by the server. */
	speed?: number
	/**
	 * Called with the *intent* each time a step is committed locally, never the
	 * resolved tile: the server runs the same resolution from the same intent,
	 * so sending the raw direction keeps the two in agreement.
	 */
	onStep?: (dx: number, dy: number) => void
	/**
	 * Authoritative position to snap to, with the timestamp of the refusal that
	 * produced it. A new `at` is what triggers the snap.
	 */
	correction?: { x: number; y: number; at: number } | null
}

/**
 * Grid-stepping overworld character, the way the 2D games do it: one tile at a
 * time, interpolated, and the next step only starts once the current one lands.
 * Collision is a lookup on the map layers, never on the rendered mesh.
 */
export function Player({
	map,
	held,
	tapped,
	spriteUrl,
	start = { x: 13, y: 18 },
	tracker,
	speed = DEFAULT_SPEED,
	onStep,
	correction = null,
}: PlayerProps) {
	const texture = useTexture(spriteUrl, (loaded) => {
		const list = Array.isArray(loaded) ? loaded : [loaded]
		list.forEach((t) => {
			t.magFilter = NearestFilter
			t.minFilter = NearestFilter
			t.generateMipmaps = false
		})
	})

	const group = useRef<Group>(null)
	const from = useRef({ ...start })
	const to = useRef({ ...start })
	const progress = useRef(1)
	/** Tiles covered by the step in progress — √2 on a diagonal, so it is not faster. */
	const stepLength = useRef(1)
	const [facingLeft, setFacingLeft] = useState(false)

	// The server refused a step: drop whatever we predicted and stand where it
	// says we are. Applied in an effect so the frame loop stays free of props.
	useEffect(() => {
		if (!correction) return
		from.current = { x: correction.x, y: correction.y }
		to.current = { x: correction.x, y: correction.y }
		progress.current = 1
	}, [correction])

	const ground = layerOf(map, 'ground')
	const objects = layerOf(map, 'objects')

	const canWalk = (x: number, y: number) => {
		if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false
		const index = y * map.width + x
		return !isSolid(ground[index]) && !isSolid(objects[index])
	}

	/** Where a step actually lands, or `null` when the way is blocked. */
	const resolveStep = (origin: Step, dx: number, dy: number): Step | null => {
		if (dx && dy) {
			// No corner cutting: a diagonal needs both orthogonal neighbours free,
			// otherwise the character would slip between two trees.
			if (canWalk(origin.x + dx, origin.y + dy) && canWalk(origin.x + dx, origin.y) && canWalk(origin.x, origin.y + dy)) {
				return { x: origin.x + dx, y: origin.y + dy }
			}
			// Blocked diagonally: slide along whichever axis is still open.
			if (canWalk(origin.x + dx, origin.y)) return { x: origin.x + dx, y: origin.y }
			if (canWalk(origin.x, origin.y + dy)) return { x: origin.x, y: origin.y + dy }
			return null
		}
		return canWalk(origin.x + dx, origin.y + dy) ? { x: origin.x + dx, y: origin.y + dy } : null
	}

	useFrame((_state, delta) => {
		const node = group.current
		if (!node) return

		if (progress.current >= 1) {
			// Held keys repeat; a tap is consumed once.
			const { dx, dy } = intentOf(held.current, tapped.current)
			tapped.current = null
			if (dx || dy) {
				if (dx < 0) setFacingLeft(true)
				if (dx > 0) setFacingLeft(false)

				const next = resolveStep(to.current, dx, dy)
				if (next) {
					from.current = { ...to.current }
					to.current = next
					stepLength.current = Math.hypot(next.x - from.current.x, next.y - from.current.y) || 1
					progress.current = 0
					// Optimistic: we walk now and let the server confirm. It replies
					// with `world:rejected` if it disagrees.
					onStep?.(dx, dy)
				}
			}
		} else {
			// Dividing by the step length keeps the speed constant on diagonals.
			progress.current = Math.min(1, progress.current + (delta * speed) / stepLength.current)
		}

		const t = progress.current
		const x = from.current.x + (to.current.x - from.current.x) * t
		const y = from.current.y + (to.current.y - from.current.y) * t
		// Little hop, so a step reads as a step.
		const bob = t < 1 ? Math.sin(t * Math.PI) * 0.12 : 0

		node.position.set(x + 0.5, bob, y + Z_OFFSET)

		// The map mesh is centred on the origin by its parent group, so the camera
		// needs the world position, not the tile position.
		if (tracker) node.getWorldPosition(tracker.current)
	})

	return (
		<group ref={group}>
			<mesh position={[0, 0.9, 0]} scale={[facingLeft ? -1.8 : 1.8, 1.8, 1.8]}>
				<planeGeometry args={[1, 1]} />
				<meshBasicMaterial map={texture} alphaTest={0.5} toneMapped={false} />
			</mesh>
		</group>
	)
}
