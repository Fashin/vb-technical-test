import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useTexture } from '@react-three/drei'
import { NearestFilter, type Group } from 'three'

import type { WorldPlayerState } from '../realtime'
import { spriteUrlFor } from './sprites'

/** Same forward nudge as the local player, so depth sorting agrees. */
const Z_OFFSET = 0.9

/**
 * Another player's character.
 *
 * Positions arrive one tile at a time, which would look like teleporting, so
 * the sprite is eased toward its target at the same speed the owner walks. The
 * easing is deliberately simple: a step lands in a known time, and anything
 * fancier (dead reckoning, extrapolation) would guess ahead of the server.
 */
export function RemotePlayer({ player, speed }: { player: WorldPlayerState; speed: number }) {
	const texture = useTexture(spriteUrlFor(player.spriteId), (loaded) => {
		const list = Array.isArray(loaded) ? loaded : [loaded]
		list.forEach((t) => {
			t.magFilter = NearestFilter
			t.minFilter = NearestFilter
			t.generateMipmaps = false
		})
	})

	const group = useRef<Group>(null)
	const placed = useRef(false)

	useFrame((_state, delta) => {
		const node = group.current
		if (!node) return

		const targetX = player.x + 0.5
		const targetZ = player.y + Z_OFFSET

		if (!placed.current) {
			placed.current = true
			node.position.set(targetX, 0, targetZ)
			return
		}

		const dx = targetX - node.position.x
		const dz = targetZ - node.position.z
		const distance = Math.hypot(dx, dz)
		if (distance < 0.001) {
			node.position.set(targetX, 0, targetZ)
			return
		}

		// Never fall behind: if we are more than a step and a half out of date
		// (a tab that was in the background, a lost packet), jump.
		if (distance > 2.5) {
			node.position.set(targetX, 0, targetZ)
			return
		}

		const travel = Math.min(distance, speed * delta)
		node.position.x += (dx / distance) * travel
		node.position.z += (dz / distance) * travel
	})

	const scale = player.facing === 'left' ? -1.8 : 1.8

	return (
		<group ref={group}>
			<mesh position={[0, 0.9, 0]} scale={[scale, 1.8, 1.8]}>
				<planeGeometry args={[1, 1]} />
				<meshBasicMaterial map={texture} alphaTest={0.5} toneMapped={false} transparent />
			</mesh>
			<Html position={[0, 2.1, 0]} center zIndexRange={[10, 0]} className="pointer-events-none select-none">
				<span className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
					{player.name}
				</span>
			</Html>
		</group>
	)
}
