import {
	AURA_COLORS,
	CLOTH_COLORS,
	CROWN_COLORS,
	HAIR_COLORS,
	PIN_COLORS,
	SKIN_TONES,
	type Appearance,
} from './appearance'

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
 * Views in the sheet: facing the camera, facing away, then in profile.
 *
 * Walking north while looking the player in the eye is the other half of why
 * the animation read wrong. The profile is the third: mirroring the front view
 * for left and right made the trainer stroll sideways while still facing the
 * camera. The profile is drawn facing right; left is that same art mirrored.
 */
export const VIEWS = 3

/** Which way a trainer is turned. */
export type View = 'front' | 'back' | 'side'

/** Cell order in the sheet; the renderer turns this into a UV offset. */
export const VIEW_INDEX: Record<View, number> = { front: 0, back: 1, side: 2 }

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

/**
 * The gait in profile, where a stride is horizontal rather than a lifted knee.
 *
 * `near` and `far` slide the two legs along the walk, in pixels: the pose with
 * them furthest apart alternates with the pass, where they cross back the
 * other way. `arm` swings the one visible arm against the near leg.
 */
const SIDE_GAIT: { near: number; far: number; arm: number }[] = [
	{ near: 0, far: 0, arm: 0 },
	{ near: 2, far: -2, arm: 1 },
	{ near: -1, far: 1, arm: -1 },
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

/**
 * The podium crown, worn above everything else on the head.
 *
 * Rows 0 to 2, which no other feature uses except the spiky hair's tufts — so
 * it is drawn last and sits on top of hair and hat alike. That is the point:
 * the leader of the ranking should not have to take their cap off to wear it,
 * and the slot it would otherwise have taken is the one the bêta-testeurs'
 * crown was moved out of.
 *
 * Three points and a band, with the band's lower row darkened: at this size
 * that single shadow row is what stops it reading as a flat bar.
 */
function drawCrown(ctx: Ctx, crown: number, back = false): void {
	if (crown <= 0 || crown >= CROWN_COLORS.length) return
	const color = CROWN_COLORS[crown]
	const dark = shade(color, 0.4)
	const light = shade(color, -0.3)

	// Band, across the top of the skull.
	px(ctx, 4, 1, 8, 1, color)
	px(ctx, 4, 2, 8, 1, dark)
	// Three points. The middle one is taller, which is what makes the outline
	// read as a crown rather than as a hat band.
	px(ctx, 4, 0, 1, 1, color)
	px(ctx, 7, 0, 2, 1, color)
	px(ctx, 11, 0, 1, 1, color)
	// The stone, on the front of the band only — from behind there is nothing
	// to set it in.
	if (!back) px(ctx, 7, 1, 2, 1, light)
}

/**
 * The crown in profile.
 *
 * Same band and the same three points, read edge-on: the points are spaced
 * along the head from nape to brow, and the stone moves to the front of the
 * band where the face is.
 */
function drawSideCrown(ctx: Ctx, crown: number): void {
	if (crown <= 0 || crown >= CROWN_COLORS.length) return
	const color = CROWN_COLORS[crown]
	const dark = shade(color, 0.4)
	const light = shade(color, -0.3)

	px(ctx, 4, 1, 9, 1, color)
	px(ctx, 4, 2, 9, 1, dark)
	px(ctx, 4, 0, 1, 1, color)
	px(ctx, 7, 0, 2, 1, color)
	px(ctx, 12, 0, 1, 1, color)
	px(ctx, 10, 1, 2, 1, light) // the stone, towards the brow
}

/**
 * Hair in profile.
 *
 * The skull is hair at the back whatever the style; only the crown and the
 * fringe depend on whether a hat is covering them.
 */
function drawSideHair(ctx: Ctx, style: number, color: string, hidden: boolean): void {
	const dark = shade(color, 0.3)

	// Style 4 is a shaved head: a hairline and nothing else.
	if (style === 4) {
		px(ctx, 4, 4, 8, 1, dark)
		return
	}

	// The nape shows under a brim, so a hat raises this but never removes it.
	const top = hidden ? 5 : 3
	px(ctx, 4, top, 4, 9 - top, color)
	px(ctx, 3, top + 1, 1, 8 - top, color)
	px(ctx, 4, 8, 3, 1, dark)

	if (!hidden) {
		px(ctx, 4, 3, 8, 2, color) // crown, nape to brow
		px(ctx, 10, 5, 2, 1, color) // fringe, over the eye
	}

	if (style === 1) {
		// Long: a tail down the back of the neck.
		px(ctx, 3, 7, 2, 5, color)
		px(ctx, 3, 12, 2, 1, dark)
	} else if (style === 2) {
		// Bunches: only the near one is visible, clear of the head.
		px(ctx, 1, 6, 2, 4, color)
		px(ctx, 1, 10, 2, 1, dark)
	} else if (style === 3 && !hidden) {
		// Spiky: the tufts lean back, away from the direction of travel.
		px(ctx, 4, 2, 2, 1, color)
		px(ctx, 7, 1, 2, 2, color)
		px(ctx, 10, 2, 1, 1, color)
	}
}

/** Beard and moustache in profile, hung on the front of the jaw. */
function drawSideFacialHair(ctx: Ctx, style: number, color: string): void {
	if (style === 0) return
	const dark = shade(color, 0.35)

	switch (style) {
		case 1: // Moustache, under the nose.
			px(ctx, 10, 7, 2, 1, color)
			break
		case 2: // Goatee: moustache plus a chin patch.
			px(ctx, 10, 7, 2, 1, color)
			px(ctx, 9, 9, 2, 1, color)
			break
		case 3: // Short beard: along the jaw, stopping at the chin.
			px(ctx, 10, 7, 2, 1, color)
			px(ctx, 8, 8, 3, 2, color)
			break
		default: // Full beard, jaw to below the chin.
			px(ctx, 7, 7, 5, 3, color)
			px(ctx, 8, 10, 3, 1, color)
			px(ctx, 10, 8, 1, 1, dark) // the mouth, so it still reads as a face
			break
	}
}

/**
 * Whether a piece of headwear covers the top of the head.
 *
 * Both of them do, which is why the hair under a hat is drawn short — but the
 * question is asked rather than assumed, so adding a headband or a flower
 * crown is one entry here rather than a rewrite of every hair style.
 */
function hidesHair(hat: number): boolean {
	return hat !== 0
}

function drawSideHat(ctx: Ctx, style: number, color: string): void {
	if (style === 0) return
	const dark = shade(color, 0.35)

	if (style === 1) {
		// Cap: the brim points where we are walking, which is the whole gain of
		// having a profile at all.
		px(ctx, 4, 2, 8, 3, color)
		px(ctx, 3, 3, 1, 2, color)
		px(ctx, 11, 5, 3, 1, dark)
		px(ctx, 6, 3, 4, 1, shade(color, -0.25))
		return
	}

	// Bandana: a band round the head with the knot trailing behind.
	px(ctx, 3, 4, 9, 2, color)
	px(ctx, 1, 5, 2, 2, dark)
}

/**
 * One profile frame, facing right.
 *
 * Its own geometry rather than a narrowed front view: the head loses a cheek
 * and gains a nose, the body is drawn edge-on, and the far leg is shaded so
 * the stride has depth. Feet land on the same rows as the other views, so the
 * character does not bounce when it turns a corner.
 */
function drawSideFrame(ctx: Ctx, appearance: Appearance, frame: number): void {
	const skin = SKIN_TONES[appearance.skin]
	const skinDark = shade(skin, 0.22)
	const hair = HAIR_COLORS[appearance.hairColor]
	const shirt = CLOTH_COLORS[appearance.shirt]
	const shirtDark = shade(shirt, 0.28)
	const trousers = CLOTH_COLORS[appearance.trousers]
	const trousersDark = shade(trousers, 0.3)
	const gait = SIDE_GAIT[frame % SIDE_GAIT.length]

	// Head. The nose on the leading edge and the single eye are what tell a
	// profile from a front view at sixteen pixels across.
	px(ctx, 4, 3, 8, 7, skin)
	px(ctx, 12, 6, 1, 2, skin) // nose
	px(ctx, 4, 9, 8, 1, skinDark) // neck shadow
	px(ctx, 9, 6, 1, 1, OUTLINE) // the one visible eye
	px(ctx, 10, 8, 1, 1, skinDark) // mouth, at the front of the jaw
	px(ctx, 6, 6, 1, 2, skinDark) // ear

	drawSideFacialHair(ctx, appearance.facialHair, hair)
	drawSideHair(ctx, appearance.hair, hair, hidesHair(appearance.hat))
	drawSideHat(ctx, appearance.hat, shirt)
	// Last on the head: the crown goes over the hat, not instead of it.
	drawSideCrown(ctx, appearance.crown)

	// Torso, two pixels narrower than the front view: a body seen edge-on
	// shows its depth, not its width.
	if (appearance.build === 1) {
		px(ctx, 5, 10, 6, 2, shirt)
		px(ctx, 6, 12, 4, 3, shirt)
	} else {
		px(ctx, 5, 10, 6, 5, shirt)
	}
	px(ctx, 5, 15, 6, 1, shirtDark)
	// On the leading edge of the chest, the part of the torso a profile shows.
	drawPin(ctx, appearance.pin, 8)

	/**
	 * One leg, planted `offset` pixels along the stride.
	 *
	 * Only the near shoe reaches a pixel further forward than the leg: giving
	 * both a toe made them meet at the widest stride and read as one slab.
	 */
	const leg = (offset: number, top: number, colour: string, hem: string, near: boolean) => {
		const x = 6 + offset
		px(ctx, x, top, 3, 20 - top, colour)
		px(ctx, x, 20, 3, 1, hem)
		px(ctx, x, 21, near ? 4 : 3, 2, OUTLINE) // shoe
	}

	if (appearance.bottom === 1) {
		// Same short flared skirt as the front view, so the two agree.
		px(ctx, 5, 16, 6, 2, trousers)
		px(ctx, 4, 18, 8, 1, trousersDark)
		// Bare legs: half the stride, since two pixels of shin cannot swing far.
		leg(Math.round(gait.far / 2), 19, skinDark, skinDark, false)
		leg(Math.round(gait.near / 2), 19, skin, skinDark, true)
	} else {
		// The hips stay solid: splitting the legs from the waist up left a hole
		// through the body at the widest point of the stride.
		px(ctx, 5, 16, 6, 1, trousers)
		// Far leg first and darker, so the near one reads as in front of it.
		leg(gait.far, 17, trousersDark, shade(trousers, 0.45), false)
		leg(gait.near, 17, trousers, trousersDark, true)
	}

	// The one arm the camera can see, swinging against the near leg.
	const armX = gait.arm > 0 ? 10 : gait.arm < 0 ? 4 : 9
	const armY = gait.arm > 0 ? 10 : 11
	px(ctx, armX, armY, 2, 4, shirt)
	px(ctx, armX, armY + 4, 2, 2, skin) // hand
}

/**
 * The arena badge, worn on the chest.
 *
 * Three pixels of enamel on a sixteen-pixel sprite, which is all there is
 * room for — but it is bright, it sits on the shirt where a real pin would,
 * and it is the one thing on the character that has to be earned. Nothing is
 * drawn from behind: a pin on the chest is not visible from the back, and
 * faking it there would make the sprite incoherent.
 */
function drawPin(ctx: Ctx, pin: number, x: number): void {
	if (pin <= 0 || pin >= PIN_COLORS.length) return
	const color = PIN_COLORS[pin]

	px(ctx, x, 11, 2, 2, color)
	px(ctx, x, 12, 2, 1, shade(color, 0.4)) // the lower half, so it reads as domed
	px(ctx, x, 13, 2, 1, OUTLINE) // the clasp, which is what makes it a pin
}

function drawFrame(ctx: Ctx, appearance: Appearance, frame: number, view: View = 'front'): void {
	if (view === 'side') {
		drawSideFrame(ctx, appearance, frame)
		return
	}
	const back = view === 'back'

	const skin = SKIN_TONES[appearance.skin]
	const skinDark = shade(skin, 0.22)
	const hair = HAIR_COLORS[appearance.hairColor]
	const shirt = CLOTH_COLORS[appearance.shirt]
	const shirtDark = shade(shirt, 0.28)
	const trousers = CLOTH_COLORS[appearance.trousers]
	const trousersDark = shade(trousers, 0.3)
	const hatHidesTop = hidesHair(appearance.hat)

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
	// Last on the head: the crown goes over the hat, not instead of it.
	drawCrown(ctx, appearance.crown, back)

	// Torso. The "Fine" build is drawn with narrower shoulders and a waist —
	// at sixteen pixels across, a two-pixel pinch is all it takes to read.
	if (appearance.build === 1) {
		px(ctx, 4, 10, 8, 2, shirt)
		px(ctx, 5, 12, 6, 3, shirt)
	} else {
		px(ctx, 4, 10, 8, 5, shirt)
	}
	px(ctx, 4, 15, 8, 1, shirtDark)
	// Worn on the wearer's left, which is the viewer's right — and never from
	// behind, where there is no chest to pin it to.
	if (!back) drawPin(ctx, appearance.pin, 9)

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
 * The aura, ring by ring: how far from the body it reaches, and how solid it
 * is there.
 *
 * A few flat rings rather than a smooth falloff, because the sprite is sixteen
 * pixels across and a gradient at that size is mud. Every alpha stays above
 * the 0.5 `alphaTest` the world's material uses — below it the glow would
 * simply be discarded on the map while still showing in the portraits.
 */
const AURA_RINGS = [0.92, 0.74, 0.58]

/**
 * How much further the glow reaches upward than sideways.
 *
 * An aura that is the same thickness all round reads as an outline; energy
 * rises, so the upward distance is divided by this before it is measured and
 * the flames stretch over the head.
 */
const AURA_LIFT = 2

/**
 * Scratch canvas the body is drawn into to find its silhouette.
 *
 * Module level and reused: one appearance means nine frames, and allocating a
 * canvas per frame showed up when a crowd walked on screen. Nothing is kept
 * between calls — it is cleared on the way in.
 */
let scratch: HTMLCanvasElement | null = null

/** The frame's own pixels, to grow the glow out of. */
function silhouette(appearance: Appearance, frame: number, view: View): Uint8ClampedArray | null {
	scratch ??= document.createElement('canvas')
	scratch.width = FRAME_W
	scratch.height = FRAME_H

	const ctx = scratch.getContext('2d', { willReadFrequently: true })
	if (!ctx) return null

	ctx.imageSmoothingEnabled = false
	ctx.clearRect(0, 0, FRAME_W, FRAME_H)
	drawFrame(ctx, appearance, frame, view)
	return ctx.getImageData(0, 0, FRAME_W, FRAME_H).data
}

/** A palette colour at a given opacity. */
function rgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16)
	return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

/**
 * The aura burning around the trainer — the bêta-testeurs' reward, and the
 * arena's.
 *
 * Grown from the sprite's own silhouette rather than drawn as a shape: it
 * follows whatever the character happens to be wearing, in every view and
 * every frame of the walk, with nothing to keep in step by hand. Each empty
 * pixel is measured against the nearest body pixel, and the ring it falls in
 * decides how solid the glow is there.
 *
 * The outer ring is punched through by a cheap hash of the pixel and the frame
 * number, so the edge is ragged and *moves*: three walk frames are three
 * different flickers, which is what makes it burn rather than sit there.
 */
function drawAura(ctx: Ctx, appearance: Appearance, frame: number, view: View): void {
	const color = AURA_COLORS[appearance.aura]
	if (!color || color === 'transparent') return

	const mask = silhouette(appearance, frame, view)
	if (!mask) return

	const solid = (x: number, y: number) =>
		x >= 0 && x < FRAME_W && y >= 0 && y < FRAME_H && mask[(y * FRAME_W + x) * 4 + 3] > 128

	// `dy > 0` means the body is *below* this pixel, so the pixel is above the
	// body and the distance is the cheap one.
	const span = AURA_RINGS.length
	const measure = (dx: number, dy: number) =>
		Math.max(Math.abs(dx), dy > 0 ? Math.ceil(dy / AURA_LIFT) : Math.abs(dy))

	/** Which ring this pixel is in, 0 for "not in the aura at all". */
	const ring = (x: number, y: number) => {
		let best = 0
		for (let dy = -span; dy <= span * AURA_LIFT; dy++) {
			for (let dx = -span; dx <= span; dx++) {
				if (!solid(x + dx, y + dy)) continue
				const distance = measure(dx, dy)
				if (distance >= 1 && distance <= span && (best === 0 || distance < best)) best = distance
			}
		}
		return best
	}

	for (let y = 0; y < FRAME_H; y++) {
		for (let x = 0; x < FRAME_W; x++) {
			if (solid(x, y)) continue

			const index = ring(x, y)
			if (index === 0) continue

			// Only the outermost ring flickers: punching holes in the inner one
			// would eat into the character's own edge. The top row of the frame
			// is flickered too, whichever ring it is in — the flames reach past
			// it, and a solid row there reads as a flat lid rather than a glow
			// running out of sprite.
			const ragged = index === span || y === 0
			if (ragged && (x * 5 + y * 3 + frame * 7) % 3 === 0) continue

			px(ctx, x, y, 1, 1, rgba(color, AURA_RINGS[index - 1]))
		}
	}
}

/** One frame, with its aura behind it when the trainer has earned one. */
function drawAuraFrame(ctx: Ctx, appearance: Appearance, frame: number, view: View): void {
	if (appearance.aura > 0) drawAura(ctx, appearance, frame, view)
	drawFrame(ctx, appearance, frame, view)
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
	// Three frames per view, in the order `VIEW_INDEX` declares.
	for (const [view, index] of Object.entries(VIEW_INDEX) as [View, number][]) {
		for (let frame = 0; frame < FRAMES; frame++) {
			ctx.save()
			ctx.translate((index * FRAMES + frame) * FRAME_W, 0)
			drawAuraFrame(ctx, appearance, frame, view)
			ctx.restore()
		}
	}
	return canvas
}

/**
 * Draw a single frame scaled up, outside the 3D scene.
 *
 * The editor preview wants the standing front view; the battle's opening
 * wants the profile, one stride at a time, so the two trainers can be seen
 * walking on. Same art either way — the sheet the world renders from is built
 * from this very function.
 */
export function drawTrainerFrame(
	canvas: HTMLCanvasElement,
	appearance: Appearance,
	scale: number,
	view: View = 'front',
	frame = 0,
): void {
	canvas.width = FRAME_W * scale
	canvas.height = FRAME_H * scale

	const ctx = canvas.getContext('2d')
	if (!ctx) return

	ctx.imageSmoothingEnabled = false
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	ctx.save()
	ctx.scale(scale, scale)
	drawAuraFrame(ctx, appearance, frame % FRAMES, view)
	ctx.restore()
}

/** Draw a single frame scaled up, for the editor preview. */
export function drawTrainerPreview(canvas: HTMLCanvasElement, appearance: Appearance, scale: number): void {
	drawTrainerFrame(canvas, appearance, scale)
}
