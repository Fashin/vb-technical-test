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
 * The three cells used here (5,6 / 6,6 / 7,6) were picked from the 63 empty
 * ones in the sheet. Their coordinates are declared in `tileset.ts`; the two
 * lists must agree.
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

/** Cell coordinates must match the entries declared in `tileset.ts`. */
const EXTRA: { col: number; row: number; paint: Painter }[] = [
	{ col: 5, row: 6, paint: cloud },
	{ col: 6, row: 6, paint: cloudDeep },
	{ col: 7, row: 6, paint: cinder },
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
