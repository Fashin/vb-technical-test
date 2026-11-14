import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, type Appearance } from './appearance'

/**
 * Procedural trainer sprite.
 *
 * The tileset shipped with the project is scenery only — it has no character
 * art — so the trainer is drawn pixel by pixel instead. That turns out to be
 * the right call for a character editor anyway: every feature is a parameter,
 * nothing has to be pre-rendered, and a new hair colour costs one array entry.
 *
 * One sprite is two frames side by side (legs together, legs apart). The
 * renderer switches between them with a UV offset, which is why the canvas is
 * `2 * FRAME_W` wide.
 */
export const FRAME_W = 16
export const FRAME_H = 24
export const FRAMES = 2

type Ctx = CanvasRenderingContext2D

/** Pixel-grid rectangle fill — every shape in the sprite goes through this. */
function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
	ctx.fillStyle = color
	ctx.fillRect(x, y, w, h)
}

/** Darken a hex colour, used for shading without a second palette. */
function shade(hex: string, amount: number): string {
	const n = parseInt(hex.slice(1), 16)
	const channel = (shift: number) =>
		Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * (1 - amount))))
	return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

const OUTLINE = 'rgba(28, 22, 18, 0.85)'

function drawHair(ctx: Ctx, style: number, color: string, hidden: boolean): void {
	const dark = shade(color, 0.3)

	// Style 4 is a shaved head: a thin hairline and nothing else.
	if (style === 4) {
		px(ctx, 4, 4, 8, 1, dark)
		return
	}

	if (!hidden) {
		px(ctx, 4, 3, 8, 3, color) // cap of hair
		px(ctx, 3, 4, 1, 3, color) // left sideburn
		px(ctx, 12, 4, 1, 3, color) // right sideburn
		px(ctx, 4, 6, 2, 1, color) // fringe
	}

	if (style === 1) {
		// Long: falls past the shoulders on both sides.
		px(ctx, 3, 7, 1, 5, color)
		px(ctx, 12, 7, 1, 5, color)
		px(ctx, 3, 12, 10, 1, dark)
	} else if (style === 2) {
		// Bunches: one on each side, clear of the body.
		px(ctx, 2, 6, 2, 4, color)
		px(ctx, 12, 6, 2, 4, color)
		px(ctx, 2, 10, 2, 1, dark)
		px(ctx, 12, 10, 2, 1, dark)
	} else if (style === 3 && !hidden) {
		// Spiky: three tufts above the hairline.
		px(ctx, 4, 2, 2, 1, color)
		px(ctx, 7, 1, 2, 2, color)
		px(ctx, 10, 2, 2, 1, color)
	}
}

function drawHat(ctx: Ctx, style: number, color: string): void {
	if (style === 0) return
	const dark = shade(color, 0.35)

	if (style === 1) {
		// Cap, with the brim pointing at the camera.
		px(ctx, 4, 2, 8, 3, color)
		px(ctx, 3, 3, 1, 2, color)
		px(ctx, 12, 3, 1, 2, color)
		px(ctx, 3, 5, 10, 1, dark) // brim
		px(ctx, 6, 3, 4, 1, shade(color, -0.25))
		return
	}

	// Bandana: a band across the forehead with a knot on the side.
	px(ctx, 3, 4, 10, 2, color)
	px(ctx, 12, 5, 2, 2, dark)
}

function drawFrame(ctx: Ctx, appearance: Appearance, frame: number): void {
	const skin = SKIN_TONES[appearance.skin]
	const skinDark = shade(skin, 0.22)
	const hair = HAIR_COLORS[appearance.hairColor]
	const shirt = CLOTH_COLORS[appearance.shirt]
	const shirtDark = shade(shirt, 0.28)
	const trousers = CLOTH_COLORS[appearance.trousers]
	const trousersDark = shade(trousers, 0.3)
	const hatHidesTop = appearance.hat !== 0

	// Head.
	px(ctx, 4, 3, 8, 7, skin)
	px(ctx, 4, 9, 8, 1, skinDark) // chin shadow
	px(ctx, 5, 6, 2, 1, OUTLINE) // eyes
	px(ctx, 9, 6, 2, 1, OUTLINE)
	px(ctx, 7, 8, 2, 1, skinDark) // mouth

	drawHair(ctx, appearance.hair, hair, hatHidesTop)
	// The hat takes the shirt colour, so head and body read as one outfit.
	drawHat(ctx, appearance.hat, shirt)

	// Torso and arms.
	px(ctx, 4, 10, 8, 6, shirt)
	px(ctx, 4, 15, 8, 1, shirtDark)
	px(ctx, 3, 11, 1, 4, shirt) // left sleeve
	px(ctx, 12, 11, 1, 4, shirt) // right sleeve
	px(ctx, 3, 15, 1, 2, skin) // left hand
	px(ctx, 12, 15, 1, 2, skin) // right hand

	// Legs: frame 0 stands, frame 1 strides.
	if (frame === 0) {
		px(ctx, 5, 16, 3, 5, trousers)
		px(ctx, 8, 16, 3, 5, trousers)
		px(ctx, 5, 20, 3, 1, trousersDark)
		px(ctx, 8, 20, 3, 1, trousersDark)
		px(ctx, 5, 21, 3, 2, OUTLINE) // shoes
		px(ctx, 8, 21, 3, 2, OUTLINE)
	} else {
		px(ctx, 4, 16, 3, 5, trousers)
		px(ctx, 9, 16, 3, 4, trousers)
		px(ctx, 4, 20, 3, 1, trousersDark)
		px(ctx, 9, 19, 3, 1, trousersDark)
		px(ctx, 4, 21, 4, 2, OUTLINE)
		px(ctx, 9, 20, 3, 2, OUTLINE)
	}
}

/**
 * Render both frames onto one canvas.
 *
 * `devicePixelRatio` is deliberately ignored: the sprite is drawn at its true
 * pixel size and scaled up by the renderer with nearest filtering, which is
 * what keeps the pixels square instead of blurred.
 */
export function drawTrainer(appearance: Appearance): HTMLCanvasElement {
	const canvas = document.createElement('canvas')
	canvas.width = FRAME_W * FRAMES
	canvas.height = FRAME_H

	const ctx = canvas.getContext('2d')
	if (!ctx) return canvas

	ctx.imageSmoothingEnabled = false
	for (let frame = 0; frame < FRAMES; frame++) {
		ctx.save()
		ctx.translate(frame * FRAME_W, 0)
		drawFrame(ctx, appearance, frame)
		ctx.restore()
	}
	return canvas
}

/** Draw a single frame scaled up, for the editor preview. */
export function drawTrainerPreview(canvas: HTMLCanvasElement, appearance: Appearance, scale: number): void {
	canvas.width = FRAME_W * scale
	canvas.height = FRAME_H * scale

	const ctx = canvas.getContext('2d')
	if (!ctx) return

	ctx.imageSmoothingEnabled = false
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	ctx.save()
	ctx.scale(scale, scale)
	drawFrame(ctx, appearance, 0)
	ctx.restore()
}
