import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute, type Texture } from 'three'

import { layerOf, type TileMapData } from './mapData'
import { Tile, cellUv, spriteFor, spriteRows } from './tileset'

interface FlatOptions {
	/** Vertical offset, used to stack flat layers without z-fighting. */
	y: number
}

function pushQuad(
	positions: number[],
	uvs: number[],
	indices: number[],
	corners: readonly number[],
	uv: readonly [number, number, number, number],
): void {
	const vertex = positions.length / 3
	positions.push(...corners)
	const [u0, v0, u1, v1] = uv
	uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)
	indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
}

function finish(positions: number[], uvs: number[], indices: number[]): BufferGeometry {
	const geometry = new BufferGeometry()
	geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
	geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
	geometry.setIndex(indices)
	geometry.computeBoundingSphere()
	return geometry
}

/** Flat layer: one horizontal quad per tile, merged into a single geometry. */
function buildFlatLayer(map: TileMapData, data: Tile[], { y }: FlatOptions): BufferGeometry {
	const positions: number[] = []
	const uvs: number[] = []
	const indices: number[] = []

	for (let row = 0; row < map.height; row++) {
		for (let col = 0; col < map.width; col++) {
			const tile = data[row * map.width + col]
			const sprite = spriteFor(tile)
			if (!sprite) continue
			pushQuad(
				positions,
				uvs,
				indices,
				[col, y, row + 1, col + 1, y, row + 1, col + 1, y, row, col, y, row],
				cellUv(sprite.col, sprite.row),
			)
		}
	}
	return finish(positions, uvs, indices)
}

/**
 * Object layer: each tile becomes a quad standing on its cell, facing +Z.
 * Sprites that are two cells tall in the sheet are emitted as two stacked
 * quads, so the 1px gutter between them is never sampled.
 */
function buildUprightLayer(map: TileMapData, data: Tile[]): BufferGeometry {
	const positions: number[] = []
	const uvs: number[] = []
	const indices: number[] = []

	for (let row = 0; row < map.height; row++) {
		for (let col = 0; col < map.width; col++) {
			const tile = data[row * map.width + col]
			const sprite = spriteFor(tile)
			if (!sprite) continue

			const height = spriteRows(tile)
			const z = row + 0.9 // slightly forward, so the base reads as planted
			for (let level = 0; level < height; level++) {
				const yBottom = level
				const yTop = level + 1
				// Bottom quad shows the sheet's lowest row of the sprite.
				const sheetRow = sprite.row + (height - 1 - level)
				pushQuad(
					positions,
					uvs,
					indices,
					[col, yBottom, z, col + 1, yBottom, z, col + 1, yTop, z, col, yTop, z],
					cellUv(sprite.col, sheetRow),
				)
			}
		}
	}
	return finish(positions, uvs, indices)
}

interface TileMapMeshProps {
	map: TileMapData
	texture: Texture
}

export function TileMapMesh({ map, texture }: TileMapMeshProps) {
	const geometries = useMemo(
		() => ({
			ground: buildFlatLayer(map, layerOf(map, 'ground'), { y: 0 }),
			overlay: buildFlatLayer(map, layerOf(map, 'overlay'), { y: 0.02 }),
			objects: buildUprightLayer(map, layerOf(map, 'objects')),
		}),
		[map],
	)

	// Geometries are built outside React's tree, so dispose them by hand.
	useEffect(
		() => () => {
			geometries.ground.dispose()
			geometries.overlay.dispose()
			geometries.objects.dispose()
		},
		[geometries],
	)

	return (
		<>
			<mesh geometry={geometries.ground}>
				<meshBasicMaterial map={texture} />
			</mesh>
			<mesh geometry={geometries.overlay}>
				<meshBasicMaterial map={texture} transparent alphaTest={0.5} />
			</mesh>
			<mesh geometry={geometries.objects}>
				<meshBasicMaterial map={texture} transparent alphaTest={0.5} />
			</mesh>
		</>
	)
}
