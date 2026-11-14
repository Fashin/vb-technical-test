import { NearestFilter, type Texture } from 'three'

/**
 * Kenney "Roguelike/RPG pack" spritesheet (CC0, www.kenney.nl).
 *
 * The sheet is a 57x31 grid of 16px tiles with a 1px gutter between them, so a
 * tile's top-left pixel is at `col * (TILE_PX + SPACING)`. The licence shipped
 * with the pack is kept next to the PNG in `public/tilesets/`.
 */
export const ATLAS_URL = '/tilesets/kenney-roguelike.png'
export const TILE_PX = 16
export const SPACING = 1
export const ATLAS_W = 968
export const ATLAS_H = 526

/**
 * Logical tiles of this project, decoupled from their position in the sheet.
 *
 * ⚠️ Mirrored from `backend/src/world/tiles.ts`, which is what fills the tile
 * arrays sent over the socket — these numeric values are a wire format and
 * must stay identical on both sides.
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

interface Sprite {
	/** Column and row of the sprite's TOP-LEFT tile in the sheet. */
	col: number
	row: number
	/** Height in tiles — 2 for the full-size trees, which are drawn stacked. */
	rows?: number
}

/** Where each logical tile lives in the Kenney sheet. */
const SPRITES: Record<Exclude<Tile, Tile.Empty>, Sprite> = {
	[Tile.Grass]: { col: 5, row: 0 },
	[Tile.GrassAlt]: { col: 5, row: 1 },
	[Tile.GrassPebbles]: { col: 9, row: 1 },
	[Tile.Dirt]: { col: 6, row: 0 },
	[Tile.DirtAlt]: { col: 6, row: 1 },
	[Tile.Sand]: { col: 8, row: 0 },
	[Tile.Stone]: { col: 7, row: 0 },
	[Tile.Water]: { col: 1, row: 1 },
	[Tile.WaterAlt]: { col: 0, row: 1 },

	[Tile.Lava]: { col: 0, row: 18 },
	[Tile.LavaAlt]: { col: 1, row: 18 },
	[Tile.Ice]: { col: 3, row: 4 },
	[Tile.Cobble]: { col: 9, row: 0 },
	// Painted into spare cells of the sheet at load time — the pack has no
	// clouds, and nothing in it passes for sky. See `extraTiles.ts`.
	[Tile.Cloud]: { col: 5, row: 6 },
	[Tile.CloudDeep]: { col: 6, row: 6 },
	[Tile.Cinder]: { col: 7, row: 6 },

	[Tile.FlowerBlue]: { col: 28, row: 9 },
	[Tile.FlowerOrange]: { col: 29, row: 9 },
	[Tile.FlowerPurple]: { col: 30, row: 9 },
	[Tile.FlowerWhite]: { col: 31, row: 9 },
	[Tile.LilyPad]: { col: 28, row: 10 },

	[Tile.Tree]: { col: 13, row: 10, rows: 2 },
	[Tile.TreePine]: { col: 16, row: 10, rows: 2 },
	[Tile.TreeSmall]: { col: 13, row: 9 },
	[Tile.Bush]: { col: 19, row: 9 },
	[Tile.BushFlower]: { col: 24, row: 9 },
	[Tile.Cactus]: { col: 22, row: 9 },
	[Tile.Fence]: { col: 47, row: 23 },
	[Tile.Boulder]: { col: 5, row: 17 },
	[Tile.SandRock]: { col: 5, row: 19 },
	[Tile.DeadTree]: { col: 27, row: 10, rows: 2 },
	[Tile.Reed]: { col: 22, row: 10 },
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

/** Tiles a walker cannot cross. Bushes are tall grass: you walk through them. */
export function isSolid(tile: Tile): boolean {
	return SOLID.has(tile)
}

export function spriteFor(tile: Tile): Sprite | null {
	if (tile === Tile.Empty) return null
	return SPRITES[tile as Exclude<Tile, Tile.Empty>] ?? null
}

/** How many tiles tall this sprite is in the sheet. */
export function spriteRows(tile: Tile): number {
	return spriteFor(tile)?.rows ?? 1
}

/**
 * UV rect of a single sheet cell, `[u0, v0, u1, v1]` with v0 at the bottom.
 * Inset by half a texel so nearest sampling never reaches into the gutter.
 */
export function cellUv(col: number, row: number): [number, number, number, number] {
	const step = TILE_PX + SPACING
	const inset = 0.5
	const x0 = col * step + inset
	const x1 = col * step + TILE_PX - inset
	const y0 = row * step + inset
	const y1 = row * step + TILE_PX - inset
	// flipY is on by default, so the sheet's top row sits at v = 1.
	return [x0 / ATLAS_W, 1 - y1 / ATLAS_H, x1 / ATLAS_W, 1 - y0 / ATLAS_H]
}

/** Crisp pixels, no mipmaps — mandatory for a 16px sheet. */
export function configureAtlas(texture: Texture): Texture {
	texture.magFilter = NearestFilter
	texture.minFilter = NearestFilter
	texture.generateMipmaps = false
	return texture
}
