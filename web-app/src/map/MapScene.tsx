import { Suspense, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { Vector3 } from 'three'

import { useAuth } from '../auth'
import { useWorld } from '../world'
import { CameraFollow, type MapBounds } from './CameraFollow'
import { type TileMapData } from './mapData'
import { Player } from './Player'
import { RemotePlayer } from './RemotePlayer'
import { spriteUrlFor } from './sprites'
import { TileMapMesh } from './TileMapMesh'
import { ATLAS_URL, configureAtlas } from './tileset'
import { usePlayerControls } from './usePlayerControls'

/** Forward nudge applied to the character by `Player`; mirrored here for the camera's first frame. */
const PLAYER_Z_OFFSET = 0.9

function Route({ map }: { map: TileMapData }) {
	const texture = useTexture(ATLAS_URL, (loaded) => {
		const list = Array.isArray(loaded) ? loaded : [loaded]
		list.forEach(configureAtlas)
	})
	return <TileMapMesh map={map} texture={texture} />
}

interface MapSceneProps {
	className?: string
}

/**
 * The shared overworld.
 *
 * The map, every position and the right to move all come from the server. This
 * component only draws them — plus one optimistic exception: our own character
 * walks the instant a key is pressed, and snaps back if the server disagrees.
 * Without that, every step would cost a round trip.
 *
 * Keyboard input is bound to this wrapper, not to `window`, so the arrow keys
 * only act once the map is focused.
 */
export function MapScene({ className }: MapSceneProps) {
	const { user, logout } = useAuth()
	const { status, error, map, speed, me, others, move, correction } = useWorld(Boolean(user))
	const { held, tapped, onKeyDown, onKeyUp, onBlur } = usePlayerControls()

	// Captured once: `Player` owns its position from here on, and the server
	// corrects it through `correction` rather than by re-mounting the component.
	const spawn = useRef<{ x: number; y: number } | null>(null)
	if (me && !spawn.current) spawn.current = { x: me.x, y: me.y }

	const playerPosition = useRef(new Vector3())
	const cameraSeeded = useRef(false)

	const centre: [number, number, number] = map ? [-map.width / 2, 0, -map.height / 2] : [0, 0, 0]

	const bounds: MapBounds = useMemo(
		() => ({
			minX: -(map?.width ?? 0) / 2,
			maxX: (map?.width ?? 0) / 2,
			minZ: -(map?.height ?? 0) / 2,
			maxZ: (map?.height ?? 0) / 2,
		}),
		[map?.width, map?.height],
	)

	// Seed the camera on the spawn tile once, so the first frame is already framed.
	if (map && spawn.current && !cameraSeeded.current) {
		cameraSeeded.current = true
		playerPosition.current.set(
			spawn.current.x + 0.5 + centre[0],
			0,
			spawn.current.y + PLAYER_Z_OFFSET + centre[2],
		)
	}

	const ready = status === 'joined' && map && me && spawn.current

	return (
		<div
			className={`relative h-full w-full bg-[#121a12] outline-none ${className ?? ''}`}
			tabIndex={0}
			onPointerDown={(event) => event.currentTarget.focus()}
			onKeyDown={onKeyDown}
			onKeyUp={onKeyUp}
			onBlur={onBlur}
		>
			{ready && (
				<Canvas dpr={[1, 2]} camera={{ position: [0, 11, 11], fov: 35 }} gl={{ antialias: false }}>
					<color attach="background" args={['#121a12']} />
					<Suspense fallback={null}>
						<group position={centre}>
							<Route map={map} />
							<Player
								map={map}
								held={held}
								tapped={tapped}
								spriteUrl={spriteUrlFor(me.spriteId)}
								start={spawn.current ?? undefined}
								tracker={playerPosition}
								speed={speed}
								onStep={move}
								correction={correction}
							/>
							{[...others.values()].map((player) => (
								<RemotePlayer key={player.id} player={player} speed={speed} />
							))}
						</group>
					</Suspense>
					<CameraFollow target={playerPosition} bounds={bounds} />
				</Canvas>
			)}

			{!ready && (
				<div className="flex h-full w-full items-center justify-center text-sm text-slate-300">
					{status === 'error' ? (error ?? 'Serveur injoignable') : 'Connexion au monde…'}
				</div>
			)}

			<div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 text-xs text-white">
				<span className="rounded bg-black/60 px-2 py-1">
					{user?.displayName}
					{others.size > 0 && ` · ${others.size} autre${others.size > 1 ? 's' : ''} en ligne`}
				</span>
				<button
					type="button"
					onClick={() => void logout()}
					className="pointer-events-auto rounded bg-black/60 px-2 py-1 hover:bg-black/80"
				>
					Déconnexion
				</button>
			</div>

			<p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-xs text-white">
				Clique sur la carte, puis déplace-toi avec les flèches ou ZQSD / WASD
			</p>
		</div>
	)
}
