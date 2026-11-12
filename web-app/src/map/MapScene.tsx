import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'

import { createRouteMap, type TileMapData } from './mapData'
import { Player } from './Player'
import { TileMapMesh } from './TileMapMesh'
import { ATLAS_URL, configureAtlas } from './tileset'
import { usePlayerControls } from './usePlayerControls'

/** Front sprite served by PokeAPI, same source as the cards and the arena. */
const DEFAULT_SPRITE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png'

function Route({ map }: { map: TileMapData }) {
	const texture = useTexture(ATLAS_URL, (loaded) => {
		const list = Array.isArray(loaded) ? loaded : [loaded]
		list.forEach(configureAtlas)
	})
	return <TileMapMesh map={map} texture={texture} />
}

interface MapSceneProps {
	map?: TileMapData
	/** Sprite walking the route; defaults to Pikachu. */
	playerSprite?: string
	className?: string
}

/**
 * Top-down overworld with a walkable character.
 *
 * Camera rotation is locked: object tiles are fixed billboards facing +Z, so
 * orbiting would show them edge-on. Panning and zooming stay available, and
 * the camera follows the player without losing the user's framing.
 *
 * Keyboard input is bound to this wrapper, not to `window`, so the arrow keys
 * keep scrolling the page until the map is focused.
 */
export function MapScene({ map, playerSprite = DEFAULT_SPRITE, className }: MapSceneProps) {
	const data = useMemo(() => map ?? createRouteMap(), [map])
	const { held, tapped, onKeyDown, onKeyUp, onBlur } = usePlayerControls()

	// The map is built in tile space; centre it on the origin here so the mesh
	// and the player share one coordinate system.
	const centre: [number, number, number] = [-data.width / 2, 0, -data.height / 2]

	return (
		<div
			className={`relative h-full w-full outline-none ${className ?? ''}`}
			tabIndex={0}
			// OrbitControls calls preventDefault on pointerdown, which would stop
			// the browser from moving focus here on its own.
			onPointerDown={(event) => event.currentTarget.focus()}
			onKeyDown={onKeyDown}
			onKeyUp={onKeyUp}
			onBlur={onBlur}
		>
			<Canvas dpr={[1, 2]} camera={{ position: [0, 16, 16], fov: 35 }} gl={{ antialias: false }}>
				<color attach="background" args={['#121a12']} />
				<Suspense fallback={null}>
					<group position={centre}>
						<Route map={data} />
						<Player map={data} held={held} tapped={tapped} spriteUrl={playerSprite} />
					</group>
				</Suspense>
				<OrbitControls
					makeDefault
					enableRotate={false}
					screenSpacePanning={false}
					minDistance={6}
					maxDistance={70}
				/>
			</Canvas>

			<p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-xs text-white">
				Clique sur la carte, puis déplace-toi avec les flèches ou ZQSD / WASD
			</p>
		</div>
	)
}
