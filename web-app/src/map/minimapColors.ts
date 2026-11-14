import { Tile } from './tileset'

/**
 * One flat colour per tile, for the minimap.
 *
 * Drawing the real sprites at two pixels a tile turns into mud: at that size
 * the only thing worth reading is *which biome is where*, so each tile is
 * reduced to the colour it reads as from a distance. The values are sampled
 * from the sprites themselves, which is why the minimap and the world agree
 * without sharing any code.
 */
const GROUND: Partial<Record<Tile, string>> = {
	[Tile.Grass]: '#7fb944',
	[Tile.GrassAlt]: '#76b03d',
	[Tile.GrassPebbles]: '#86bd55',
	[Tile.Dirt]: '#b57a48',
	[Tile.DirtAlt]: '#ad7342',
	[Tile.Sand]: '#e4d7a8',
	[Tile.Stone]: '#b6bec2',
	[Tile.Cobble]: '#a8b1b6',
	[Tile.Water]: '#4dc0e6',
	[Tile.WaterAlt]: '#45b6dd',
	[Tile.Lava]: '#e2611e',
	[Tile.LavaAlt]: '#cf5416',
	[Tile.Ice]: '#bfe4f3',
	[Tile.Cloud]: '#eef4fb',
	[Tile.CloudDeep]: '#7d93b2',
	[Tile.Cinder]: '#3b3330',
}

/**
 * Objects that are worth a pixel of their own.
 *
 * Flowers and lily pads are deliberately absent: at this scale they would
 * speckle the map with noise that tells the player nothing.
 */
const OBJECTS: Partial<Record<Tile, string>> = {
	[Tile.Tree]: '#3f7a2a',
	[Tile.TreePine]: '#2f6b36',
	[Tile.TreeSmall]: '#4a8a31',
	[Tile.Bush]: '#5a9b36',
	[Tile.BushFlower]: '#5f9f3c',
	[Tile.Reed]: '#5a9b36',
	[Tile.Cactus]: '#3f8c4a',
	[Tile.Fence]: '#9a6b3f',
	[Tile.Boulder]: '#8e979c',
	[Tile.SandRock]: '#c9bb92',
	[Tile.DeadTree]: '#6b4a32',
}

/** Colour for a tile stack, or null when nothing should be painted. */
export function minimapColor(ground: Tile, object: Tile): string | null {
	return OBJECTS[object] ?? GROUND[ground] ?? null
}
