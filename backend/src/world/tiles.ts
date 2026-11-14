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

	// Ground, elemental corners.
	Lava = 10,
	LavaAlt,
	/** Frozen lake surface: crossable, unlike open water. */
	Ice,
	/** Cloud floor of the sky plateau. */
	Cloud,
	/** The gaps between clouds — nothing to stand on. */
	CloudDeep,
	/** Burnt ground around the lava. */
	Cinder,
	Cobble,

	// Overlay — drawn flat, just above the ground.
	FlowerBlue = 20,
	FlowerOrange,
	FlowerPurple,
	FlowerWhite,
	LilyPad,

	// Objects — drawn as upright billboards.
	Tree = 40,
	TreePine,
	TreeSmall,
	Bush,
	BushFlower,
	Cactus,
	Fence,
	Boulder,
	SandRock,
	DeadTree,
	Reed,
}

const SOLID = new Set<Tile>([
	Tile.Water,
	Tile.WaterAlt,
	Tile.Lava,
	Tile.LavaAlt,
	Tile.CloudDeep,
	Tile.Tree,
	Tile.TreePine,
	Tile.TreeSmall,
	Tile.Cactus,
	Tile.Fence,
	Tile.Boulder,
	Tile.SandRock,
	Tile.DeadTree,
])

/**
 * Tiles a walker cannot cross.
 *
 * Bushes and reeds are tall grass: you walk through them. Ice is the frozen
 * surface of a lake, so unlike open water it carries you.
 */
export function isSolid(tile: Tile): boolean {
	return SOLID.has(tile)
}
