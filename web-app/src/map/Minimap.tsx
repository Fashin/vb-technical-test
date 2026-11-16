import { useEffect, useMemo, useRef } from 'react'

import type { WorldPlayerState } from '../realtime'
import { layerOf, type TileMapData } from './mapData'
import { minimapColor } from './minimapColors'

/** Pixels per tile. Three keeps a 120x84 world legible without taking the screen. */
const SCALE = 3
/** Side of a player marker, in pixels. */
const DOT = 6
/** Side of a camp marker. Bigger than a player: it is a place, not a person. */
const CAMP = 9

/** A zero-weight element over a marker the canvas painted, for the tour to aim at. */
function Landmark({ name, x, y }: { name: string; x: number; y: number }) {
	return (
		<span
			data-tutorial={name}
			aria-hidden="true"
			className="absolute block"
			style={{
				left: x * SCALE + SCALE / 2 - CAMP / 2,
				top: y * SCALE + SCALE / 2 - CAMP / 2,
				width: CAMP,
				height: CAMP,
			}}
		/>
	)
}

/** The site of `sites` closest to the player, so the tour points at a reachable one. */
function nearest<T extends { x: number; y: number }>(sites: T[] | undefined, me: WorldPlayerState | null) {
	if (!sites || sites.length === 0) return null
	if (!me) return sites[0]

	return sites.reduce((best, site) =>
		Math.abs(site.x - me.x) + Math.abs(site.y - me.y) < Math.abs(best.x - me.x) + Math.abs(best.y - me.y)
			? site
			: best,
	)
}

/**
 * Overview of the whole world, bottom right.
 *
 * The terrain is painted once into an offscreen canvas and then blitted: the
 * map never changes during a session, so redrawing ten thousand tiles every
 * time somebody takes a step would be wasted work. Only the markers are drawn
 * per update.
 *
 * It shows the entire map rather than a window around the player — with four
 * elemental corners, knowing *which way* to walk is the thing worth showing.
 */
export function Minimap({
	map,
	me,
	others,
}: {
	map: TileMapData
	me: WorldPlayerState | null
	others: Map<string, WorldPlayerState>
}) {
	const canvas = useRef<HTMLCanvasElement>(null)

	// Recomputed as the player walks: `nearest` is a scan of a handful of sites.
	const camp = nearest(map.camps, me)
	const center = nearest(map.centers, me)

	// Terrain and camps, painted once per map: neither ever moves during a
	// session, and the camps are the whole reason to read this thing.
	const terrain = useMemo(() => {
		const surface = document.createElement('canvas')
		surface.width = map.width * SCALE
		surface.height = map.height * SCALE

		const ctx = surface.getContext('2d')
		if (!ctx) return surface

		ctx.fillStyle = '#121a12'
		ctx.fillRect(0, 0, surface.width, surface.height)

		const ground = layerOf(map, 'ground')
		const objects = layerOf(map, 'objects')

		for (let y = 0; y < map.height; y++) {
			for (let x = 0; x < map.width; x++) {
				const index = y * map.width + x
				const color = minimapColor(ground[index], objects[index])
				if (!color) continue
				ctx.fillStyle = color
				ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
			}
		}
		// The healing centre, in its own colour: it is the one place the player
		// is sent back to, so it must never be mistaken for a camp.
		for (const site of map.centers ?? []) {
			const x = site.x * SCALE + SCALE / 2
			const y = site.y * SCALE + SCALE / 2
			ctx.fillStyle = '#1c1917'
			ctx.fillRect(x - CAMP / 2 - 1, y - CAMP / 2 - 1, CAMP + 2, CAMP + 2)
			ctx.fillStyle = '#ffffff'
			ctx.fillRect(x - CAMP / 2, y - CAMP / 2, CAMP, CAMP)
			ctx.fillStyle = '#c4423c'
			ctx.fillRect(x - 1, y - CAMP / 2, 2, CAMP)
			ctx.fillRect(x - CAMP / 2, y - 1, CAMP, 2)
		}

		// Camp markers: a pale square with a dark ring, drawn into the terrain so
		// they cost nothing per frame.
		for (const camp of map.camps ?? []) {
			const x = camp.x * SCALE + SCALE / 2
			const y = camp.y * SCALE + SCALE / 2
			ctx.fillStyle = '#1c1917'
			ctx.fillRect(x - CAMP / 2 - 1, y - CAMP / 2 - 1, CAMP + 2, CAMP + 2)
			ctx.fillStyle = '#f2d06b'
			ctx.fillRect(x - CAMP / 2, y - CAMP / 2, CAMP, CAMP)
			ctx.fillStyle = '#8c4a32'
			ctx.fillRect(x - 1, y - CAMP / 2, 2, CAMP)
		}

		return surface
	}, [map])

	useEffect(() => {
		const node = canvas.current
		const ctx = node?.getContext('2d')
		if (!node || !ctx) return

		ctx.imageSmoothingEnabled = false
		ctx.clearRect(0, 0, node.width, node.height)
		ctx.drawImage(terrain, 0, 0)

		const marker = (player: WorldPlayerState, fill: string, ring: string) => {
			const x = player.x * SCALE + SCALE / 2
			const y = player.y * SCALE + SCALE / 2
			ctx.fillStyle = ring
			ctx.fillRect(x - DOT / 2 - 1, y - DOT / 2 - 1, DOT + 2, DOT + 2)
			ctx.fillStyle = fill
			ctx.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT)
		}

		// Everyone else first, so our own marker is never hidden under theirs.
		for (const player of others.values()) marker(player, '#fbbf24', '#1c1917')
		if (me) marker(me, '#ffffff', '#065f46')
	}, [terrain, me, others])

	return (
		<div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-white/20 bg-black/55 p-1 shadow-lg">
			<div className="relative">
				<canvas
					ref={canvas}
					width={map.width * SCALE}
					height={map.height * SCALE}
					role="img"
					aria-label={`Carte du monde, ${map.camps?.length ?? 0} camps d'entraînement${
						me ? `, tu es en ${me.x}, ${me.y}` : ''
					}`}
					className="block [image-rendering:pixelated]"
				/>
				{/* Invisible stand-ins for two markers the terrain is painted with.
				    The welcome tour points at places, and a tile drawn into a canvas
				    has no element to point at — these give it one. */}
				{camp && <Landmark name="camps" x={camp.x} y={camp.y} />}
				{center && <Landmark name="center" x={center.x} y={center.y} />}
			</div>
		</div>
	)
}
