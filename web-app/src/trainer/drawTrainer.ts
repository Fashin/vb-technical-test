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

/**
 * Frames in the walk cycle: standing, left leg forward, right leg forward.
 *
 * Three rather than two because a step has to *alternate* legs. With a single
 * stride pose the character held one leg out for the whole walk and snapped
 * back between steps, which read as a limp rather than a walk.
 */
export const FRAMES = 3

/**
 * Views in the sheet: facing the camera, then facing away.
 *
 * Walking north while looking the player in the eye is the other half of why
 * the animation read wrong. Left and right reuse the front view mirrored, as
 * the 2D games do — only the back needs drawing.
 */
export const VIEWS = 2

/**
 * The gait, per frame.
 *
 * `lift` raises a leg by that many pixels — the swinging leg is drawn shorter,
 * which is how a front-facing sprite says "this foot is off the ground".
 * `arm` swings the arms the other way, as they do when you actually walk.
 */
const GAIT: { left: number; right: number; arm: number }[] = [
	{ left: 0, right: 0, arm: 0 },
	{ left: 2, right: 0, arm: 1 },
	{ left: 0, right: 2, arm: -1 },
]

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

function drawHair(ctx: Ctx, style: number, color: string, hidden: boolean, back = false): void {
	const dark = shade(color, 0.3)

	// From behind there is no face: the skull is hair all the way down. Under a
	// hat only the part below the brim shows — bare skin there would read as a
	// bald patch, which is what the first version did.
	if (back && style !== 4) {
		const top = hidden ? 5 : 3
		px(ctx, 4, top, 8, 9 - top, color)
		px(ctx, 3, top + 1, 1, 8 - top, color)
		px(ctx, 12, top + 1, 1, 8 - top, color)
		px(ctx, 4, 8, 8, 1, dark)
	}

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
		if (back) px(ctx, 4, 9, 8, 3, color)
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

/**
 * Beard and moustache, drawn over the face.
 *
 * Only ever in the front view — from behind there is no face to grow it on.
 * The styles sit in rows 7 to 10, between the eyes and the collar, so they
 * read without eating into the eyes.
 */
function drawFacialHair(ctx: Ctx, style: number, color: string): void {
	if (style === 0) return
	const dark = shade(color, 0.35)

	switch (style) {
		case 1: // Moustache
			px(ctx, 6, 7, 4, 1, color)
			break
		case 2: // Goatee: moustache plus a chin patch, open at the cheeks.
			px(ctx, 6, 7, 4, 1, color)
			px(ctx, 6, 8, 1, 1, color)
			px(ctx, 9, 8, 1, 1, color)
			px(ctx, 6, 9, 4, 1, color)
			break
		case 3: // Short beard: starts low on the cheeks, stops at the chin. The
			// two rows it gives up are what tell it apart from the full one.
			px(ctx, 4, 8, 2, 2, color)
			px(ctx, 10, 8, 2, 2, color)
			px(ctx, 6, 7, 4, 1, color)
			px(ctx, 5, 9, 6, 1, color)
			break
		default: // Full beard, down past the chin.
			px(ctx, 4, 7, 8, 3, color)
			px(ctx, 5, 10, 6, 1, color)
			px(ctx, 7, 8, 2, 1, dark) // the mouth, so it still reads as a face
			break
	}
}

function drawHat(ctx: Ctx, style: number, color: string, back = false): void {
	if (style === 0) return
	const dark = shade(color, 0.35)

	if (style === 1 && back) {
		// From behind a cap has no brim, just the strap gap.
		px(ctx, 4, 2, 8, 4, color)
		px(ctx, 3, 3, 1, 3, color)
		px(ctx, 12, 3, 1, 3, color)
		px(ctx, 6, 5, 4, 1, dark)
		return
	}

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
	px(ctx, back ? 1 : 12, 5, 2, 2, dark)
}

function drawFrame(ctx: Ctx, appearance: Appearance, frame: number, back = false): void {
	const skin = SKIN_TONES[appearance.skin]
	const skinDark = shade(skin, 0.22)
	const hair = HAIR_COLORS[appearance.hairColor]
	const shirt = CLOTH_COLORS[appearance.shirt]
	const shirtDark = shade(shirt, 0.28)
	const trousers = CLOTH_COLORS[appearance.trousers]
	const trousersDark = shade(trousers, 0.3)
	const hatHidesTop = appearance.hat !== 0

	// Head. No face from behind — that is the whole point of the back view.
	px(ctx, 4, 3, 8, 7, skin)
	px(ctx, 4, 9, 8, 1, skinDark) // neck shadow
	if (!back) {
		px(ctx, 5, 6, 2, 1, OUTLINE) // eyes
		px(ctx, 9, 6, 2, 1, OUTLINE)
		px(ctx, 7, 8, 2, 1, skinDark) // mouth
	}

	if (!back) drawFacialHair(ctx, appearance.facialHair, hair)
	drawHair(ctx, appearance.hair, hair, hatHidesTop, back)
	// The hat takes the shirt colour, so head and body read as one outfit.
	drawHat(ctx, appearance.hat, shirt, back)

	// Torso. The "Fine" build is drawn with narrower shoulders and a waist —
	// at sixteen pixels across, a two-pixel pinch is all it takes to read.
	if (appearance.build === 1) {
		px(ctx, 4, 10, 8, 2, shirt)
		px(ctx, 5, 12, 6, 3, shirt)
	} else {
		px(ctx, 4, 10, 8, 5, shirt)
	}
	px(ctx, 4, 15, 8, 1, shirtDark)

	// Legs. The planted one reaches the ground, the swinging one is cut short:
	// on a front-facing sprite that is how a raised foot reads.
	const gait = GAIT[frame % GAIT.length]
	const wearsSkirt = appearance.bottom === 1

	/** One leg, from `top` down to the ground, raised by `lift`. */
	const leg = (x: number, lift: number, top: number, width: number, colour: string, hem: string) => {
		const bottom = 20 - lift
		if (bottom >= top) {
			px(ctx, x, top, width, bottom - top, colour)
			px(ctx, x, bottom, width, 1, hem)
		}
		px(ctx, x, bottom + 1, width, 2, OUTLINE) // shoe
	}

	if (wearsSkirt) {
		// A flared skirt whose hem doubles as the widest row, so there is still
		// room for the legs underneath — a longer skirt hid the walk entirely.
		px(ctx, 4, 16, 8, 2, trousers)
		px(ctx, 3, 18, 10, 1, trousersDark)
		// Half the lift: two pixels of leg cannot swing as far as a full one.
		leg(5, Math.min(gait.left, 1), 19, 2, skin, skinDark)
		leg(9, Math.min(gait.right, 1), 19, 2, skin, skinDark)
	} else {
		leg(4, gait.left, 16, 3, trousers, trousersDark)
		leg(9, gait.right, 16, 3, trousers, trousersDark)
	}

	// Arms swing opposite the legs.
	const arm = (x: number, offset: number) => {
		px(ctx, x, 11 + offset, 1, 4, shirt)
		px(ctx, x, 15 + offset, 1, 2, skin) // hand
	}
	arm(3, gait.arm)
	arm(12, -gait.arm)
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
	canvas.width = FRAME_W * FRAMES * VIEWS
	canvas.height = FRAME_H

	const ctx = canvas.getContext('2d')
	if (!ctx) return canvas

	ctx.imageSmoothingEnabled = false
	// Front views first, then the same three frames seen from behind.
	for (let view = 0; view < VIEWS; view++) {
		for (let frame = 0; frame < FRAMES; frame++) {
			ctx.save()
			ctx.translate((view * FRAMES + frame) * FRAME_W, 0)
			drawFrame(ctx, appearance, frame, view === 1)
			ctx.restore()
		}
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
