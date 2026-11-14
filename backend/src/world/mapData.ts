import { Tile } from './tiles'

/**
 * The world's one and only map generator.
 *
 * It lives on the server because the server is authoritative over movement: it
 * has to answer "is that tile walkable" itself, and a second generator in the
 * web app could drift by one tile and start rejecting steps the client thought
 * were legal. Clients receive the finished layers in `world:welcome`.
 *
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
	/** Walkable tile the character starts on — the main crossroads. */
	spawn: { x: number; y: number }
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

export const DEFAULT_WIDTH = 80
export const DEFAULT_HEIGHT = 56

/** Width of every road, in tiles. */
const ROAD = 3

interface Rect {
	x: number
	y: number
	w: number
	h: number
}

/**
 * Sample route: grass, a road network with two crossroads, two ponds with
 * their sandy shores, tall-grass patches and a tree border.
 *
 * Every feature is placed as a fraction of `width`/`height`, so the map can be
 * resized from one call without the landmarks bunching up in a corner.
 * Replace with a Tiled export whenever a real map exists — nothing downstream
 * reads anything but the three layers.
 */
export function createRouteMap(seed = 1337, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): TileMapData {
	const random = rng(seed)
	const ground: Tile[] = new Array(width * height).fill(Tile.Grass)
	const overlay: Tile[] = new Array(width * height).fill(Tile.Empty)
	const objects: Tile[] = new Array(width * height).fill(Tile.Empty)

	const at = (x: number, y: number) => y * width + x
	const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height
	const dirt = () => (random() < 0.5 ? Tile.Dirt : Tile.DirtAlt)
	const fillGround = (rect: Rect, tile: () => Tile) => {
		for (let y = rect.y; y < rect.y + rect.h; y++) {
			for (let x = rect.x; x < rect.x + rect.w; x++) {
				if (inside(x, y)) ground[at(x, y)] = tile()
			}
		}
	}

	for (let i = 0; i < ground.length; i++) {
		const roll = random()
		if (roll < 0.12) ground[i] = Tile.GrassAlt
		else if (roll < 0.16) ground[i] = Tile.GrassPebbles
	}

	// Ponds, each with a sand shore one tile wide. Placed before the roads so a
	// road always wins if the two ever overlap.
	const ponds: Rect[] = [
		{
			x: Math.round(width * 0.74),
			y: Math.round(height * 0.12),
			w: Math.round(width * 0.18),
			h: Math.round(height * 0.2),
		},
		{
			x: Math.round(width * 0.08),
			y: Math.round(height * 0.78),
			w: Math.round(width * 0.16),
			h: Math.round(height * 0.14),
		},
	]
	for (const pond of ponds) {
		fillGround({ x: pond.x - 1, y: pond.y - 1, w: pond.w + 2, h: pond.h + 2 }, () => Tile.Sand)
		fillGround(pond, () => (random() < 0.5 ? Tile.Water : Tile.WaterAlt))
	}

	// Road network: one horizontal trunk across the map, one branch going north
	// and one going south, each ending at a border gap.
	const trunkY = Math.round(height * 0.62)
	const northX = Math.round(width * 0.28)
	const southX = Math.round(width * 0.68)

	fillGround({ x: 0, y: trunkY, w: width, h: ROAD }, dirt)
	fillGround({ x: northX, y: 0, w: ROAD, h: trunkY }, dirt)
	fillGround({ x: southX, y: trunkY + ROAD, w: ROAD, h: height - trunkY - ROAD }, dirt)

	// A stone plaza at each crossing; the northern one is where the player spawns.
	const plazas: Rect[] = [
		{ x: northX - 2, y: trunkY - 1, w: ROAD + 4, h: ROAD + 2 },
		{ x: southX - 2, y: trunkY - 1, w: ROAD + 4, h: ROAD + 2 },
	]
	for (const plaza of plazas) {
		for (let y = plaza.y; y < plaza.y + plaza.h; y++) {
			for (let x = plaza.x; x < plaza.x + plaza.w; x++) {
				if (inside(x, y) && random() < 0.7) ground[at(x, y)] = Tile.Stone
			}
		}
	}

	const walkableGrass = (x: number, y: number) => {
		const t = ground[at(x, y)]
		return t === Tile.Grass || t === Tile.GrassAlt || t === Tile.GrassPebbles
	}

	// Tall-grass patches: grass underneath, bushes on the object layer. Their
	// count follows the area, so a bigger map does not feel emptier.
	const patchCount = Math.max(3, Math.round((width * height) / 330))
	for (let i = 0; i < patchCount; i++) {
		const patch: Rect = {
			x: 2 + Math.floor(random() * (width - 12)),
			y: 2 + Math.floor(random() * (height - 10)),
			w: 5 + Math.floor(random() * 6),
			h: 4 + Math.floor(random() * 4),
		}
		for (let y = patch.y; y < patch.y + patch.h; y++) {
			for (let x = patch.x; x < patch.x + patch.w; x++) {
				if (!inside(x, y) || !walkableGrass(x, y)) continue
				if (random() < 0.85) objects[at(x, y)] = Tile.Bush
			}
		}
	}

	// Tree border, with a gap wherever a road leaves the map.
	for (let x = 0; x < width; x++) {
		objects[at(x, 0)] = Tile.Tree
		objects[at(x, height - 1)] = Tile.Tree
	}
	for (let y = 0; y < height; y++) {
		objects[at(0, y)] = Tile.Tree
		objects[at(width - 1, y)] = Tile.Tree
	}
	for (let d = 0; d < ROAD; d++) {
		objects[at(0, trunkY + d)] = Tile.Empty
		objects[at(width - 1, trunkY + d)] = Tile.Empty
		objects[at(northX + d, 0)] = Tile.Empty
		objects[at(southX + d, height - 1)] = Tile.Empty
	}

	// Scattered nature on whatever grass is still free.
	const FLOWERS = [Tile.FlowerBlue, Tile.FlowerOrange, Tile.FlowerPurple, Tile.FlowerWhite]
	for (let y = 2; y < height - 2; y++) {
		for (let x = 2; x < width - 2; x++) {
			if (!walkableGrass(x, y) || objects[at(x, y)] !== Tile.Empty) continue
			const roll = random()
			if (roll < 0.03) objects[at(x, y)] = Tile.Tree
			else if (roll < 0.045) objects[at(x, y)] = Tile.TreePine
			else if (roll < 0.055) objects[at(x, y)] = Tile.TreeSmall
			else if (roll < 0.065) objects[at(x, y)] = Tile.BushFlower
			else if (roll < 0.1) overlay[at(x, y)] = FLOWERS[Math.floor(random() * FLOWERS.length)]
		}
	}

	// Cacti on the sand rings around the ponds.
	for (const pond of ponds) {
		for (let y = pond.y - 1; y < pond.y + pond.h + 1; y++) {
			for (let x = pond.x - 1; x < pond.x + pond.w + 1; x++) {
				if (!inside(x, y)) continue
				if (ground[at(x, y)] === Tile.Sand && random() < 0.12) objects[at(x, y)] = Tile.Cactus
			}
		}
	}

	// A fenced plot just north of the first crossroads.
	const fenceY = trunkY - 5
	for (let x = northX + ROAD + 2; x < northX + ROAD + 9; x++) {
		if (inside(x, fenceY) && walkableGrass(x, fenceY)) objects[at(x, fenceY)] = Tile.Fence
	}

	// The spawn sits on the first plaza; make sure nothing was dropped on it.
	const spawn = { x: northX + 1, y: trunkY + 1 }
	objects[at(spawn.x, spawn.y)] = Tile.Empty

	return {
		width,
		height,
		tilewidth: 16,
		layers: [
			{ name: 'ground', data: ground },
			{ name: 'overlay', data: overlay },
			{ name: 'objects', data: objects },
		],
		spawn,
	}
}
