/**
 * Logical tiles of the overworld.
 *
 * ⚠️ These numeric ids are a wire format: the server sends tile arrays and the
 * web app looks each id up in its own spritesheet table. The enum is mirrored
 * in `web-app/src/map/tileset.ts` — adding a tile means adding it on both
 * sides, with the same value.
 */
export enum Tile {
	Empty = 0,

	// Ground — drawn flat.
	Grass = 1,
	GrassAlt,
	GrassPebbles,
	Dirt,
	DirtAlt,
	Sand,
	Stone,
	Water,
	WaterAlt,

	// Overlay — drawn flat, just above the ground.
	FlowerBlue = 20,
	FlowerOrange,
	FlowerPurple,
	FlowerWhite,

	// Objects — drawn as upright billboards.
	Tree = 40,
	TreePine,
	TreeSmall,
	Bush,
	BushFlower,
	Cactus,
	Fence,
}

const SOLID = new Set<Tile>([
	Tile.Water,
	Tile.WaterAlt,
	Tile.Tree,
	Tile.TreePine,
	Tile.TreeSmall,
	Tile.Cactus,
	Tile.Fence,
])

/** Tiles a walker cannot cross. Bushes are tall grass: you walk through them. */
export function isSolid(tile: Tile): boolean {
	return SOLID.has(tile)
}
