import { useRef } from 'react'
import { Billboard, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

interface PokemonActorProps {
	/** Sprite or artwork URL served by the backend's pokemon payload. */
	image: string
	position: [number, number, number]
	/** Mirror the sprite so the two fighters face each other. */
	flipped?: boolean
	scale?: number
}

/**
 * A fighter on the arena floor: a camera-facing textured plane that idles
 * with a slow bob. Swap for a glTF model later without touching the stage.
 */
export function PokemonActor({ image, position, flipped = false, scale = 2.4 }: PokemonActorProps) {
	const texture = useTexture(image)
	const group = useRef<Group>(null)
	const [x, y, z] = position

	useFrame((state) => {
		if (!group.current) return
		group.current.position.y = y + Math.sin(state.clock.elapsedTime * 1.5) * 0.08
	})

	return (
		<group ref={group} position={[x, y, z]}>
			<Billboard follow lockX lockZ>
				<mesh scale={[flipped ? -scale : scale, scale, scale]}>
					<planeGeometry args={[1, 1]} />
					<meshBasicMaterial map={texture} transparent alphaTest={0.05} toneMapped={false} />
				</mesh>
			</Billboard>
		</group>
	)
}
