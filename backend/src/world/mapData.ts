import { Tile, isSolid } from './tiles'

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

export const DEFAULT_WIDTH = 120
export const DEFAULT_HEIGHT = 84

/** Width of every road, in tiles. */
const ROAD = 3

/** The four elemental corners. */
type Element = 'air' | 'fire' | 'water' | 'earth'

/**
 * How far a corner biome reaches, as a fraction of the map.
 *
 * Tuned down from a half: at that size the four of them met in the middle and
 * swallowed the roads and the crossroads. At 0.34 they read as corners and the
 * meadow keeps the centre.
 */
const CORNER_REACH = 0.34

/** How ragged a biome's edge is, as a fraction of its reach. */
const CORNER_FRAY = 0.14

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
	// Both sit in the central meadow, clear of the elemental corners: a pond
	// half-swallowed by a lava field reads as a mistake, not as a feature.
	const ponds: Rect[] = [
		{
			x: Math.round(width * 0.56),
			y: Math.round(height * 0.2),
			w: Math.round(width * 0.14),
			h: Math.round(height * 0.16),
		},
		{
			x: Math.round(width * 0.12),
			y: Math.round(height * 0.4),
			w: Math.round(width * 0.11),
			h: Math.round(height * 0.12),
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

	/** Which scenery a biome fences itself in with at the map edge. */
	const borderObject = (groundTile: Tile): Tile => {
		if (groundTile === Tile.Cinder) return Tile.DeadTree
		if (groundTile === Tile.Stone || groundTile === Tile.Sand) return Tile.Boulder
		if (groundTile === Tile.Cloud) return Tile.Boulder
		return Tile.Tree
	}

	/**
	 * Paint one tile of an elemental corner.
	 *
	 * `depth` runs from 0 at the biome's edge to 1 at the corner itself, so the
	 * lava, the open water and the void sit at the heart of each corner while
	 * the approach stays walkable.
	 */
	const paintBiome = (element: Element, index: number, depth: number) => {
		overlay[index] = Tile.Empty
		objects[index] = Tile.Empty

		switch (element) {
			case 'fire':
				if (depth > 0.55) ground[index] = random() < 0.5 ? Tile.Lava : Tile.LavaAlt
				else {
					ground[index] = random() < 0.75 ? Tile.Cinder : Tile.Stone
					if (random() < 0.06) objects[index] = Tile.DeadTree
					else if (random() < 0.08) objects[index] = Tile.Boulder
				}
				break

			case 'water':
				if (depth > 0.62) ground[index] = random() < 0.5 ? Tile.Water : Tile.WaterAlt
				else if (depth > 0.42) {
					ground[index] = Tile.Ice
					if (random() < 0.05) overlay[index] = Tile.LilyPad
				} else {
					ground[index] = random() < 0.7 ? Tile.Sand : Tile.GrassPebbles
					if (random() < 0.1) objects[index] = Tile.Reed
				}
				break

			case 'earth':
				ground[index] = random() < 0.55 ? Tile.Stone : random() < 0.6 ? Tile.Cobble : Tile.Sand
				if (depth > 0.5 && random() < 0.16) objects[index] = Tile.Boulder
				else if (random() < 0.07) objects[index] = Tile.SandRock
				else if (random() < 0.04) objects[index] = Tile.Cactus
				break

			default:
				// Air: a cloud plateau, torn open by the void at its heart.
				if (depth > 0.6 && random() < 0.35) ground[index] = Tile.CloudDeep
				else ground[index] = random() < 0.8 ? Tile.Cloud : Tile.Stone
				break
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

	/* ----------------------------- elemental corners ----------------------------- */

	// Each corner is a blob rather than a rectangle: the radius is modulated by
	// noise so the biome bleeds into the meadow instead of ending on a seam.
	const CORNERS: { element: Element; cx: number; cy: number }[] = [
		{ element: 'air', cx: 0, cy: 0 },
		{ element: 'fire', cx: 1, cy: 0 },
		{ element: 'water', cx: 0, cy: 1 },
		{ element: 'earth', cx: 1, cy: 1 },
	]

	for (const { element, cx, cy } of CORNERS) {
		const originX = cx * (width - 1)
		const originY = cy * (height - 1)
		const reachX = width * CORNER_REACH
		const reachY = height * CORNER_REACH

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				// Elliptical distance, so a wide map gets wide corners.
				const dx = (x - originX) / reachX
				const dy = (y - originY) / reachY
				const distance = Math.hypot(dx, dy)
				// The noise is sampled per tile, which frays the edge one tile at
				// a time — enough to look natural at this scale.
				if (distance > 1 - CORNER_FRAY + random() * CORNER_FRAY * 2) continue

				// `depth` is 1 at the very corner and 0 at the biome's edge; the
				// harsher features are reserved for the heart of it.
				paintBiome(element, at(x, y), 1 - distance)
			}
		}
	}

	// Border, with a gap wherever a road leaves the map. Each biome walls itself
	// in with its own scenery; where the ground is already impassable — lava, a
	// lake, the void between clouds — nothing needs to be added on top.
	const border = (x: number, y: number) => {
		if (isSolid(ground[at(x, y)])) {
			objects[at(x, y)] = Tile.Empty
			return
		}
		objects[at(x, y)] = borderObject(ground[at(x, y)])
	}
	for (let x = 0; x < width; x++) {
		border(x, 0)
		border(x, height - 1)
	}
	for (let y = 0; y < height; y++) {
		border(0, y)
		border(width - 1, y)
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

	/*
	 * The spawn sits on the first plaza. Clear a small landing around it by
	 * hand: the corner biomes are noisy blobs, and one unlucky roll spilling
	 * lava or open water onto the spawn would strand every new player.
	 */
	const spawn = { x: northX + 1, y: trunkY + 1 }
	for (let y = spawn.y - 1; y <= spawn.y + 1; y++) {
		for (let x = spawn.x - 1; x <= spawn.x + 1; x++) {
			if (!inside(x, y)) continue
			ground[at(x, y)] = Tile.Stone
			objects[at(x, y)] = Tile.Empty
		}
	}

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
