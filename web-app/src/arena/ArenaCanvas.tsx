import { Suspense, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { ArenaFloor } from './ArenaFloor'

interface ArenaCanvasProps {
	children?: ReactNode
	/** Allow the user to orbit/zoom the camera. */
	controls?: boolean
	className?: string
}

/**
 * Three.js stage shared by every arena scene: camera, lights, floor and shadows.
 * Drop battle actors in as children — they are rendered inside the <Canvas>,
 * so they must be three.js elements, not DOM ones.
 */
export function ArenaCanvas({ children, controls = true, className }: ArenaCanvasProps) {
	return (
		<Canvas
			className={className}
			shadows
			dpr={[1, 2]}
			camera={{ position: [0, 2.6, 7], fov: 45 }}
		>
			<color attach="background" args={['#0f172a']} />
			<fog attach="fog" args={['#0f172a', 12, 26]} />

			<ambientLight intensity={0.6} />
			<hemisphereLight args={['#bae6fd', '#1e293b', 0.8]} />
			<directionalLight
				position={[4, 8, 5]}
				intensity={1.6}
				castShadow
				shadow-mapSize={[1024, 1024]}
			/>

			<Suspense fallback={null}>
				<ArenaFloor />
				{children}
			</Suspense>

			<ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={20} blur={2.4} far={6} />

			{controls && (
				<OrbitControls
					enablePan={false}
					minDistance={4}
					maxDistance={14}
					maxPolarAngle={Math.PI / 2.15}
				/>
			)}
		</Canvas>
	)
}
