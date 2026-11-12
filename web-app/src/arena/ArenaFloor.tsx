import { Circle, Ring } from '@react-three/drei'

/** Flat battle ground with the two facing stand circles. */
export function ArenaFloor() {
	return (
		<group rotation={[-Math.PI / 2, 0, 0]}>
			<Circle args={[9, 64]} receiveShadow>
				<meshStandardMaterial color="#1e293b" roughness={0.9} metalness={0.05} />
			</Circle>
			<Ring args={[8.5, 9, 64]} position={[0, 0, 0.002]}>
				<meshBasicMaterial color="#38bdf8" toneMapped={false} />
			</Ring>
			{([-3, 3] as const).map((x) => (
				<Ring key={x} args={[1.5, 1.62, 48]} position={[x, 0, 0.002]}>
					<meshBasicMaterial color="#64748b" toneMapped={false} />
				</Ring>
			))}
		</group>
	)
}
