import { SPACING, TILE_PX } from './tileset'

/**
 * Tiles the Kenney pack does not have, painted into spare cells of its sheet.
 *
 * The pack is a roguelike scenery set: it has lava, rock, ice and lily pads,
 * but nothing that passes for sky. Rather than add a second texture — which
 * would mean a second material and a second draw call per layer — the missing
 * tiles are drawn into cells of the sheet that are entirely transparent, so
 * the whole map still renders from one atlas and `cellUv` keeps working
 * unchanged.
 *
 * The cells used here (5,6 / 6,6 / 7,6 for the ground tiles, 8,6 and 8,7 for
 * the training camp, 9,6 and 9,7 for the healing centre) were picked from the
 * 63 empty ones in the sheet. Their coordinates are declared in `tileset.ts`; the two lists
 * must agree.
 */

const STEP = TILE_PX + SPACING

type Painter = (ctx: CanvasRenderingContext2D) => void

/** Deterministic speckle placement: the texture must not shimmer on reload. */
function speckles(
	ctx: CanvasRenderingContext2D,
	seed: number,
	count: number,
	color: string,
	size = 1,
): void {
	let state = seed >>> 0
	const next = () => {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 4294967296
	}
	ctx.fillStyle = color
	for (let i = 0; i < count; i++) {
		const x = Math.floor(next() * (TILE_PX - size + 1))
		const y = Math.floor(next() * (TILE_PX - size + 1))
		ctx.fillRect(x, y, size, size)
	}
}

/** Cloud floor: pale, soft, with a hint of shadow so it is not a flat square. */
const cloud: Painter = (ctx) => {
	ctx.fillStyle = '#eef4fb'
	ctx.fillRect(0, 0, TILE_PX, TILE_PX)
	ctx.fillStyle = '#d9e6f5'
	speckles(ctx, 0x5eed, 10, '#d9e6f5', 3)
	ctx.fillStyle = '#ffffff'
	speckles(ctx, 0x1c0d, 8, '#ffffff', 2)
}

/** The void between clouds: darker, cold, and clearly not something to stand on. */
const cloudDeep: Painter = (ctx) => {
	ctx.fillStyle = '#7d93b2'
	ctx.fillRect(0, 0, TILE_PX, TILE_PX)
	speckles(ctx, 0x2b71, 9, '#6a7f9c', 3)
	speckles(ctx, 0x44a1, 6, '#94a9c4', 2)
}

/** Burnt ground: charcoal with embers still glowing in it. */
const cinder: Painter = (ctx) => {
	ctx.fillStyle = '#3b3330'
	ctx.fillRect(0, 0, TILE_PX, TILE_PX)
	speckles(ctx, 0x77c3, 12, '#2a2422', 2)
	speckles(ctx, 0x9f12, 4, '#8a4b2a', 1)
	speckles(ctx, 0xb3e7, 2, '#d8722c', 1)
}

/**
 * Training camp, upper half: a tiled roof with a banner on its ridge.
 *
 * Drawn as a billboard two cells tall, so this one sits above `campBase` and
 * must line up with it column by column.
 */
const campRoof: Painter = (ctx) => {
	/*
	 * Banner on a pole, left of the ridge.
	 *
	 * The pole runs *into* the roof rather than stopping above it: the roof is
	 * painted afterwards and covers its last pixels, which is what makes the
	 * flag read as planted in the building instead of floating over it.
	 */
	ctx.fillStyle = '#6b5336'
	ctx.fillRect(3, 1, 1, 10)
	ctx.fillStyle = '#d8613c'
	ctx.fillRect(4, 1, 5, 3)
	ctx.fillStyle = '#f2d06b'
	ctx.fillRect(4, 2, 2, 1)

	// Roof: two slopes, darker on the right so it reads as lit from the left.
	for (let row = 0; row < 7; row++) {
		const y = 9 + row
		const inset = Math.max(0, 3 - Math.floor(row / 2))
		ctx.fillStyle = '#8c4a32'
		ctx.fillRect(inset, y, TILE_PX - inset * 2, 1)
		ctx.fillStyle = '#6f3826'
		ctx.fillRect(TILE_PX - inset - 3, y, 3, 1)
	}
	ctx.fillStyle = '#c96a44'
	ctx.fillRect(3, 9, TILE_PX - 6, 1)
}

/** Training camp, lower half: timber walls, an open doorway, a bench. */
const campBase: Painter = (ctx) => {
	// Eaves, overhanging the walls.
	ctx.fillStyle = '#6f3826'
	ctx.fillRect(0, 0, TILE_PX, 2)

	ctx.fillStyle = '#c4a173'
	ctx.fillRect(1, 2, TILE_PX - 2, 12)
	ctx.fillStyle = '#a8865c'
	speckles(ctx, 0x3f71, 14, '#a8865c', 2)

	// Posts at the corners.
	ctx.fillStyle = '#7d5f3c'
	ctx.fillRect(1, 2, 1, 12)
	ctx.fillRect(TILE_PX - 2, 2, 1, 12)

	// Doorway, dark and open: this tile is walked into, not knocked on.
	ctx.fillStyle = '#2b2119'
	ctx.fillRect(6, 6, 5, 8)
	ctx.fillStyle = '#3d2f22'
	ctx.fillRect(6, 6, 5, 1)

	// Training dummy beside the door.
	ctx.fillStyle = '#6b5336'
	ctx.fillRect(3, 9, 1, 5)
	ctx.fillStyle = '#9c8257'
	ctx.fillRect(2, 7, 3, 2)

	// Ground shadow, so the hut sits on its yard instead of floating.
	ctx.fillStyle = 'rgba(0,0,0,0.25)'
	ctx.fillRect(1, 14, TILE_PX - 2, 2)
}

/** Healing centre, upper half: a red roof carrying a white cross. */
const centerRoof: Painter = (ctx) => {
	for (let row = 0; row < 8; row++) {
		const y = 8 + row
		const inset = Math.max(0, 3 - Math.floor(row / 2))
		ctx.fillStyle = '#c4423c'
		ctx.fillRect(inset, y, TILE_PX - inset * 2, 1)
		ctx.fillStyle = '#9c2f2c'
		ctx.fillRect(TILE_PX - inset - 3, y, 3, 1)
	}
	ctx.fillStyle = '#e4645c'
	ctx.fillRect(3, 8, TILE_PX - 6, 1)

	// The cross: what the building is, readable at 16 pixels.
	ctx.fillStyle = '#ffffff'
	ctx.fillRect(7, 10, 2, 5)
	ctx.fillRect(5, 11, 6, 2)
}

/** Healing centre, lower half: pale walls, wide doors, a lit window. */
const centerBase: Painter = (ctx) => {
	ctx.fillStyle = '#9c2f2c'
	ctx.fillRect(0, 0, TILE_PX, 2)

	ctx.fillStyle = '#e8e4dc'
	ctx.fillRect(1, 2, TILE_PX - 2, 12)
	ctx.fillStyle = '#cfc9bf'
	speckles(ctx, 0x6a21, 10, '#cfc9bf', 2)

	// Double doors, open onto a dark hall.
	ctx.fillStyle = '#3a4450'
	ctx.fillRect(5, 6, 6, 8)
	ctx.fillStyle = '#566374'
	ctx.fillRect(7, 6, 1, 8)

	// A window, lit: the centre is open.
	ctx.fillStyle = '#f2d06b'
	ctx.fillRect(2, 5, 2, 2)
	ctx.fillRect(12, 5, 2, 2)

	ctx.fillStyle = 'rgba(0,0,0,0.25)'
	ctx.fillRect(1, 14, TILE_PX - 2, 2)
}

/** Cell coordinates must match the entries declared in `tileset.ts`. */
const EXTRA: { col: number; row: number; paint: Painter }[] = [
	{ col: 5, row: 6, paint: cloud },
	{ col: 6, row: 6, paint: cloudDeep },
	{ col: 7, row: 6, paint: cinder },
	{ col: 8, row: 6, paint: campRoof },
	{ col: 8, row: 7, paint: campBase },
	{ col: 9, row: 6, paint: centerRoof },
	{ col: 9, row: 7, paint: centerBase },
]

/**
 * Copy the sheet into a canvas and paint the extra tiles into it.
 *
 * Returns a canvas rather than mutating anything: the source image is shared
 * by the browser cache and must stay untouched.
 */
export function buildAtlasCanvas(image: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
	const canvas = document.createElement('canvas')
	canvas.width = image.width
	canvas.height = image.height

	const ctx = canvas.getContext('2d')
	if (!ctx) return canvas

	ctx.imageSmoothingEnabled = false
	ctx.drawImage(image, 0, 0)

	for (const { col, row, paint } of EXTRA) {
		ctx.save()
		ctx.translate(col * STEP, row * STEP)
		// Clip so a painter can never bleed into its neighbours' cells.
		ctx.beginPath()
		ctx.rect(0, 0, TILE_PX, TILE_PX)
		ctx.clip()
		paint(ctx)
		ctx.restore()
	}

	return canvas
}
