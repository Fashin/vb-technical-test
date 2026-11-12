import { Tile } from './tileset'

/**
 * Map format, deliberately close to a Tiled export (`width`, `height`,
 * `tilewidth`, flat layer arrays) so a real `.tmj` can be loaded later by
 * reading its layers straight into this shape.
 *
 * Three layers, each rendered differently:
 *  - `ground`  flat, opaque, one tile everywhere
 *  - `overlay` flat, transparent, sits just above the ground (flowers…)
 *  - `objects` upright billboards (trees, bushes, fences)
 */
export type LayerName = 'ground' | 'overlay' | 'objects'

export interface TileLayer {
	name: LayerName
	/** Row-major, `width * height` tile ids. 0 means "nothing here". */
	data: Tile[]
}

export interface TileMapData {
	width: number
	height: number
	tilewidth: number
	layers: TileLayer[]
}

export function layerOf(map: TileMapData, name: LayerName): Tile[] {
	return map.layers.find((l) => l.name === name)?.data ?? []
}

export function tileAt(map: TileMapData, name: LayerName, x: number, y: number): Tile {
	if (x < 0 || y < 0 || x >= map.width || y >= map.height) return Tile.Empty
	return layerOf(map, name)[y * map.width + x] ?? Tile.Empty
}

/** mulberry32 — small seeded PRNG so the route looks the same on every reload. */
function rng(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const WIDTH = 40
const HEIGHT = 28

/**
 * Sample route: grass, a crossing dirt path, a pond with its sandy shore,
 * tall-grass patches and a tree border. Replace with a Tiled export whenever a
 * real map exists — nothing downstream reads anything but the three layers.
 */
export function createRouteMap(seed = 1337): TileMapData {
	const random = rng(seed)
	const ground: Tile[] = new Array(WIDTH * HEIGHT).fill(Tile.Grass)
	const overlay: Tile[] = new Array(WIDTH * HEIGHT).fill(Tile.Empty)
	const objects: Tile[] = new Array(WIDTH * HEIGHT).fill(Tile.Empty)
	const at = (x: number, y: number) => y * WIDTH + x

	for (let i = 0; i < ground.length; i++) {
		const roll = random()
		if (roll < 0.12) ground[i] = Tile.GrassAlt
		else if (roll < 0.16) ground[i] = Tile.GrassPebbles
	}

	// Pond, with a sand shore one tile wide.
	const pond = { x: 26, y: 4, w: 10, h: 8 }
	for (let y = pond.y - 1; y < pond.y + pond.h + 1; y++) {
		for (let x = pond.x - 1; x < pond.x + pond.w + 1; x++) {
			if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue
			ground[at(x, y)] = Tile.Sand
		}
	}
	for (let y = pond.y; y < pond.y + pond.h; y++) {
		for (let x = pond.x; x < pond.x + pond.w; x++) {
			ground[at(x, y)] = random() < 0.5 ? Tile.Water : Tile.WaterAlt
		}
	}

	// Dirt path: horizontal trunk with a branch going north.
	const pathY = 17
	const dirt = () => (random() < 0.5 ? Tile.Dirt : Tile.DirtAlt)
	for (let x = 1; x < WIDTH - 1; x++) {
		for (let dy = 0; dy < 3; dy++) ground[at(x, pathY + dy)] = dirt()
	}
	for (let y = 6; y < pathY; y++) {
		for (let dx = 0; dx < 3; dx++) ground[at(12 + dx, y)] = dirt()
	}

	// A small stone plaza where the two roads meet.
	for (let y = pathY - 1; y < pathY + 4; y++) {
		for (let x = 11; x < 17; x++) {
			if (random() < 0.7) ground[at(x, y)] = Tile.Stone
		}
	}

	const walkableGrass = (x: number, y: number) => {
		const t = ground[at(x, y)]
		return t === Tile.Grass || t === Tile.GrassAlt || t === Tile.GrassPebbles
	}

	// Tall-grass patches: grass underneath, bushes on the object layer.
	const patches = [
		{ x: 3, y: 4, w: 7, h: 5 },
		{ x: 18, y: 20, w: 9, h: 5 },
		{ x: 30, y: 16, w: 7, h: 6 },
	]
	for (const p of patches) {
		for (let y = p.y; y < p.y + p.h; y++) {
			for (let x = p.x; x < p.x + p.w; x++) {
				if (x >= WIDTH || y >= HEIGHT || !walkableGrass(x, y)) continue
				if (random() < 0.85) objects[at(x, y)] = Tile.Bush
			}
		}
	}

	// Tree border, with a gap where the road leaves the map.
	for (let x = 0; x < WIDTH; x++) {
		objects[at(x, 0)] = Tile.Tree
		objects[at(x, HEIGHT - 1)] = Tile.Tree
	}
	for (let y = 0; y < HEIGHT; y++) {
		objects[at(0, y)] = Tile.Tree
		objects[at(WIDTH - 1, y)] = Tile.Tree
	}
	for (let dy = 0; dy < 3; dy++) {
		objects[at(0, pathY + dy)] = Tile.Empty
		objects[at(WIDTH - 1, pathY + dy)] = Tile.Empty
	}

	// Scattered nature on whatever grass is still free.
	const FLOWERS = [Tile.FlowerBlue, Tile.FlowerOrange, Tile.FlowerPurple, Tile.FlowerWhite]
	for (let y = 2; y < HEIGHT - 2; y++) {
		for (let x = 2; x < WIDTH - 2; x++) {
			if (!walkableGrass(x, y) || objects[at(x, y)] !== Tile.Empty) continue
			const roll = random()
			if (roll < 0.03) objects[at(x, y)] = Tile.Tree
			else if (roll < 0.045) objects[at(x, y)] = Tile.TreePine
			else if (roll < 0.055) objects[at(x, y)] = Tile.TreeSmall
			else if (roll < 0.065) objects[at(x, y)] = Tile.BushFlower
			else if (roll < 0.1) overlay[at(x, y)] = FLOWERS[Math.floor(random() * FLOWERS.length)]
		}
	}

	// Cacti on the sand ring around the pond.
	for (let y = pond.y - 1; y < pond.y + pond.h + 1; y++) {
		for (let x = pond.x - 1; x < pond.x + pond.w + 1; x++) {
			if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue
			if (ground[at(x, y)] === Tile.Sand && random() < 0.12) objects[at(x, y)] = Tile.Cactus
		}
	}

	// A fenced plot next to the junction.
	for (let x = 17; x < 23; x++) objects[at(x, 13)] = Tile.Fence

	return {
		width: WIDTH,
		height: HEIGHT,
		tilewidth: 16,
		layers: [
			{ name: 'ground', data: ground },
			{ name: 'overlay', data: overlay },
			{ name: 'objects', data: objects },
		],
	}
}
