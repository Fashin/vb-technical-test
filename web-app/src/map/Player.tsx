import { useRef, useState, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { NearestFilter, Vector3, type Group } from 'three'

import { layerOf, type TileMapData } from './mapData'
import { isSolid } from './tileset'
import type { Direction } from './usePlayerControls'

/** Tiles walked per second. */
const SPEED = 4.5
/** Same forward nudge as the object billboards, so depth sorting agrees. */
const Z_OFFSET = 0.9

const STEP: Record<Direction, [number, number]> = {
	up: [0, -1],
	down: [0, 1],
	left: [-1, 0],
	right: [1, 0],
}

/** Minimal shape of the OrbitControls instance we need to keep in sync. */
interface TargetedControls {
	target: Vector3
	update: () => void
}

function asTargetedControls(controls: unknown): TargetedControls | null {
	if (!controls || typeof controls !== 'object') return null
	const candidate = controls as Partial<TargetedControls>
	return candidate.target instanceof Vector3 && typeof candidate.update === 'function'
		? (candidate as TargetedControls)
		: null
}

export interface PlayerProps {
	map: TileMapData
	held: MutableRefObject<Direction[]>
	tapped: MutableRefObject<Direction | null>
	spriteUrl: string
	start?: { x: number; y: number }
	/** Keep the camera centred on the player as it walks. */
	follow?: boolean
}

/**
 * Grid-stepping overworld character, the way the 2D games do it: one tile at a
 * time, interpolated, and the next step only starts once the current one lands.
 * Collision is a lookup on the map layers, never on the rendered mesh.
 */
export function Player({ map, held, tapped, spriteUrl, start = { x: 13, y: 18 }, follow = true }: PlayerProps) {
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
	const placed = useRef(false)
	const previous = useRef(new Vector3())
	const [facingLeft, setFacingLeft] = useState(false)

	const camera = useThree((state) => state.camera)
	const controls = useThree((state) => state.controls)

	const ground = layerOf(map, 'ground')
	const objects = layerOf(map, 'objects')

	const canWalk = (x: number, y: number) => {
		if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false
		const index = y * map.width + x
		return !isSolid(ground[index]) && !isSolid(objects[index])
	}

	useFrame((_state, delta) => {
		const node = group.current
		if (!node) return

		if (progress.current >= 1) {
			// A held key repeats; a tap is consumed once.
			const direction = held.current[0] ?? tapped.current
			tapped.current = null
			if (direction) {
				if (direction === 'left') setFacingLeft(true)
				if (direction === 'right') setFacingLeft(false)

				const [dx, dy] = STEP[direction]
				const next = { x: to.current.x + dx, y: to.current.y + dy }
				if (canWalk(next.x, next.y)) {
					from.current = { ...to.current }
					to.current = next
					progress.current = 0
				}
			}
		} else {
			progress.current = Math.min(1, progress.current + delta * SPEED)
		}

		const t = progress.current
		const x = from.current.x + (to.current.x - from.current.x) * t
		const y = from.current.y + (to.current.y - from.current.y) * t
		// Little hop, so a step reads as a step.
		const bob = t < 1 ? Math.sin(t * Math.PI) * 0.12 : 0

		node.position.set(x + 0.5, bob, y + Z_OFFSET)

		if (!placed.current) {
			placed.current = true
			previous.current.copy(node.position)
			return
		}

		if (follow) {
			const moved = node.position.clone().sub(previous.current)
			if (moved.lengthSq() > 0) {
				// Shift camera and orbit target by exactly what the player moved,
				// so the user's own zoom and framing survive.
				camera.position.add(moved)
				const targeted = asTargetedControls(controls)
				if (targeted) {
					targeted.target.add(moved)
					targeted.update()
				}
			}
		}
		previous.current.copy(node.position)
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
