import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { type Group } from 'three'

import type { WorldPlayerState } from '../realtime'
import { TrainerSprite, type View } from '../trainer'
import { ACTOR_Z } from './depth'

/** Same forward nudge as the local player, so depth sorting agrees. */
const Z_OFFSET = ACTOR_Z

/**
 * Another player's character.
 *
 * Positions arrive one tile at a time, which would look like teleporting, so
 * the sprite is eased toward its target at the same speed the owner walks. The
 * easing is deliberately simple: a step lands in a known time, and anything
 * fancier (dead reckoning, extrapolation) would guess ahead of the server.
 */
export function RemotePlayer({ player, speed }: { player: WorldPlayerState; speed: number }) {
	const group = useRef<Group>(null)
	const placed = useRef(false)
	// Driven by whether the sprite is still catching up with its target tile.
	const [walkFrame, setWalkFrame] = useState(0)
	/**
	 * Remote players send positions, not animation state, so the leading leg is
	 * inferred: every new tile is one step, so flipping on each one reproduces
	 * the same alternation the owner sees.
	 */
	const steps = useRef(0)
	/**
	 * The server sends left/right facing but not which way the character is
	 * turned — it does not need it, and the client can read it off two
	 * consecutive positions, the same way the local player decides it.
	 */
	const last = useRef({ x: player.x, y: player.y })
	const [view, setView] = useState<View>('front')

	useEffect(() => {
		steps.current += 1
		// A horizontal step wins over a vertical one, as it does locally.
		if (player.x !== last.current.x) setView('side')
		else if (player.y < last.current.y) setView('back')
		else if (player.y > last.current.y) setView('front')
		last.current = { x: player.x, y: player.y }
	}, [player.x, player.y])

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
			setWalkFrame((current) => (current === 0 ? current : 0))
			return
		}

		const next = steps.current % 2 === 0 ? 1 : 2
		setWalkFrame((current) => (current === next ? current : next))

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

	return (
		<group ref={group}>
			<TrainerSprite
				appearance={player.appearance}
				facingLeft={player.facing === 'left'}
				frame={walkFrame}
				view={view}
			/>
			<Html position={[0, 1.9, 0]} center zIndexRange={[10, 0]} className="pointer-events-none select-none">
				<span className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
					{player.name}
				</span>
			</Html>
		</group>
	)
}
