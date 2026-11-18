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
 * Empty pixels kept around the body in every cell, for the flames to burn in.
 *
 * The body art is still laid out in its own 16x24 - every coordinate in
 * `drawFrame` means what it always meant - and the cell is simply bigger than
 * the body, with the body translated into it. Without this the aura had
 * nowhere to go: three pixels over the head and three at the sides is a glow
 * trapped in a box, which is exactly what it looked like. Fire rises, so the
 * room is overwhelmingly above, and there is barely any below - the trainer is
 * standing on the ground.
 */
export const PAD_X = 7
export const PAD_TOP = 12
export const PAD_BOTTOM = 2

/** One cell of the sheet: the body plus the room the flames need. */
export const CELL_W = FRAME_W + PAD_X * 2
export const CELL_H = FRAME_H + PAD_TOP + PAD_BOTTOM

/**
 * Phases in the flame's own animation loop.
 *
 * The aura used to be animated only by the walk cycle, which meant a trainer
 * standing still had a frozen aura - the one time you actually look at it. It
 * now has a cycle of its own, orthogonal to the walk: every `(view, frame)`
 * pair appears `AURA_PHASES` times in the sheet, and the renderer runs through
 * the phases on a clock rather than on footsteps. The turbulence is driven by
 * sines of `phase / AURA_PHASES * 2PI` at whole-number frequencies, so the
 * last phase hands back to the first without a seam.
 */
export const AURA_PHASES = 8

/**
 * How fast the flame runs, in phases per second.
 *
 * Deliberately slower than the display: fire at sixty frames a second on a
 * sprite this size is static noise. Ten is a flame that visibly licks.
 */
export const AURA_FPS = 10

/**
 * How many phases a given trainer's sheet actually holds.
 *
 * One, for everyone who has not earned an aura: eight identical copies of a
 * trainer with no flames is eight times the texture for nothing.
 */
export function auraPhases(appearance: Appearance): number {
	return appearance.aura > 0 ? AURA_PHASES : 1
}

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
 * How the heat spreads out of the body, per pixel of travel.
 *
 * The aura is no longer a distance measured around the silhouette - that is
 * how it ended up a cube, and then a slightly rounded cube. It is a heat
 * field: every body pixel is a source at full strength, and the heat is swept
 * *upward* first, fanning one pixel sideways per row as it climbs, then bled
 * sideways, then a little downward. Three cheap passes over the cell, and what
 * comes out is the shape of something burning rather than an outline traced
 * around a sprite - a plume over the head, flames licking up the arms, almost
 * nothing under the shoes.
 *
 * `HEAT_RISE` is what sets the height: 0.855 per row means the plume is still
 * alive some ten rows above the hair, which is what `PAD_TOP` is for.
 */
const HEAT_RISE = 0.855
const HEAT_FAN = 0.9
const HEAT_SIDE = 0.66
const HEAT_SINK = 0.42

/** Heat below this is not drawn at all - the edge of the flame. */
const AURA_CUT = 0.27

/** How hard the turbulence pushes that edge in and out, as a share of the heat. */
const AURA_TURB = 0.55

/**
 * How solid the glow is, in three bands from the body outwards.
 *
 * Flat bands rather than a smooth falloff, because the sprite is sixteen
 * pixels across and a gradient at that size is mud. Every alpha stays above
 * the 0.5 `alphaTest` the world's material uses - below it the glow would
 * simply be discarded on the map while still showing in the portraits.
 */
const AURA_STEPS = [0.95, 0.8, 0.62]

/**
 * How far each band is blended towards white.
 *
 * The heart of a flame is hotter than its colour: the innermost band is nearly
 * white, which is what stops a big aura from reading as a flat coloured blob.
 */
const AURA_WHITE = [0.45, 0.12, 0]

/**
 * Scratch canvas the body is drawn into to find its silhouette.
 *
 * Module level and reused: one appearance means nine poses and eight phases
 * each, and allocating a canvas per cell showed up when a crowd walked on
 * screen. Nothing is kept between calls - it is cleared on the way in.
 */
let scratch: HTMLCanvasElement | null = null

/** The body's own pixels, to grow the flame out of. */
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

/** The working buffers, all in cell coordinates and all reused. */
const CELL = CELL_W * CELL_H
const bodyMask = new Uint8Array(CELL)
const heat = new Float32Array(CELL)
const flame = new Float32Array(CELL)

/**
 * Fill `bodyMask` and `heat` for one pose.
 *
 * Independent of the phase, so the sheet computes it once per `(view, frame)`
 * and paints all eight phases out of it.
 */
function buildHeat(appearance: Appearance, frame: number, view: View): boolean {
	const mask = silhouette(appearance, frame, view)
	if (!mask) return false

	bodyMask.fill(0)
	heat.fill(0)
	for (let y = 0; y < FRAME_H; y++) {
		for (let x = 0; x < FRAME_W; x++) {
			if (mask[(y * FRAME_W + x) * 4 + 3] <= 128) continue
			const i = (y + PAD_TOP) * CELL_W + x + PAD_X
			bodyMask[i] = 1
			heat[i] = 1
		}
	}

	// Upward, bottom row to top: each pixel takes the hottest of the three
	// below it, so the plume both climbs and fans out as it goes.
	for (let y = CELL_H - 2; y >= 0; y--) {
		for (let x = 0; x < CELL_W; x++) {
			const below = (y + 1) * CELL_W + x
			let b = heat[below]
			// The fan sideways is penalised, or the plume climbs as a wedge as
			// wide as it is tall instead of narrowing to a tip.
			if (x > 0 && heat[below - 1] * HEAT_FAN > b) b = heat[below - 1] * HEAT_FAN
			if (x < CELL_W - 1 && heat[below + 1] * HEAT_FAN > b) b = heat[below + 1] * HEAT_FAN
			const i = y * CELL_W + x
			if (b * HEAT_RISE > heat[i]) heat[i] = b * HEAT_RISE
		}
	}

	// Sideways, once each way, so the flame hugs the arms and the legs too.
	for (let y = 0; y < CELL_H; y++) {
		const row = y * CELL_W
		for (let x = 1; x < CELL_W; x++) {
			const v = heat[row + x - 1] * HEAT_SIDE
			if (v > heat[row + x]) heat[row + x] = v
		}
		for (let x = CELL_W - 2; x >= 0; x--) {
			const v = heat[row + x + 1] * HEAT_SIDE
			if (v > heat[row + x]) heat[row + x] = v
		}
	}

	// And a little downward, or the shoes stand in a hole.
	for (let y = 1; y < CELL_H; y++) {
		for (let x = 0; x < CELL_W; x++) {
			const i = y * CELL_W + x
			const v = heat[i - CELL_W] * HEAT_SINK
			if (v > heat[i]) heat[i] = v
		}
	}
	return true
}

/** A palette colour, blended towards white, at a given opacity. */
function rgba(hex: string, alpha: number, white: number): string {
	const n = parseInt(hex.slice(1), 16)
	const channel = (shift: number) => {
		const c = (n >> shift) & 0xff
		return Math.round(c + (255 - c) * white)
	}
	return `rgba(${channel(16)}, ${channel(8)}, ${channel(0)}, ${alpha})`
}

/** The colour of this trainer's aura, or null when they have not earned one. */
function auraColor(appearance: Appearance): string | null {
	const color = AURA_COLORS[appearance.aura]
	return !color || color === 'transparent' ? null : color
}

/**
 * Paint one phase of the flame out of the heat field.
 *
 * The turbulence is three sines beaten against each other - their periods
 * share no common multiple across the cell, so no two columns flicker alike -
 * and all three advance with the phase at whole-number rates, which is what
 * makes the loop seamless. Two of them run against `y`, so the disturbance
 * crawls *up* the flame over the cycle, the way fire feeds itself.
 *
 * The faintest band is dropped where it has no lit neighbour: at this size a
 * lone pixel of glow four pixels out reads as dirt on the screen rather than
 * as a spark.
 */
function paintAura(ctx: Ctx, color: string, phase: number): void {
	const t = (phase / AURA_PHASES) * Math.PI * 2
	for (let y = 0; y < CELL_H; y++) {
		for (let x = 0; x < CELL_W; x++) {
			const i = y * CELL_W + x
			if (heat[i] === 0) {
				flame[i] = 0
				continue
			}
			const turb =
				0.55 * Math.sin(x * 1.35 - y * 0.3 + 2 * t) +
				0.35 * Math.sin(x * 2.3 + y * 0.22 - t) +
				0.25 * Math.sin(x * 0.7 + y * 0.5 - 3 * t)
			// The disturbance grows as the flame rises: the fire is steady where
			// it leaves the body and tears itself into points at the top.
			const amp = AURA_TURB * (0.5 + 1.1 * (1 - y / CELL_H))
			flame[i] = heat[i] * (1 + amp * turb)
		}
	}

	const band = AURA_STEPS.map((alpha, index) => rgba(color, alpha, AURA_WHITE[index]))
	const lit = (i: number) => flame[i] > AURA_CUT || bodyMask[i] === 1

	for (let y = 0; y < CELL_H; y++) {
		for (let x = 0; x < CELL_W; x++) {
			const i = y * CELL_W + x
			if (bodyMask[i] === 1) continue

			const v = flame[i]
			if (v <= AURA_CUT) continue

			if (v < AURA_CUT * 1.6) {
				const alone =
					!(x > 0 && lit(i - 1)) &&
					!(x < CELL_W - 1 && lit(i + 1)) &&
					!(y > 0 && lit(i - CELL_W)) &&
					!(y < CELL_H - 1 && lit(i + CELL_W))
				if (alone) continue
				px(ctx, x, y, 1, 1, band[2])
				continue
			}
			px(ctx, x, y, 1, 1, v > AURA_CUT * 2.2 ? band[0] : band[1])
		}
	}
}

/** The body, drawn at its place inside the padded cell. */
function paintBody(ctx: Ctx, appearance: Appearance, frame: number, view: View): void {
	ctx.save()
	ctx.translate(PAD_X, PAD_TOP)
	drawFrame(ctx, appearance, frame, view)
	ctx.restore()
}

/**
 * Render the whole sheet onto one canvas.
 *
 * Three poses per view, three views, and - for a trainer with an aura - eight
 * phases of flame per pose, laid out in that nesting so that the renderer's
 * cell index is `(view * FRAMES + frame) * phases + phase`. The heat field is
 * built once per pose and all eight phases are painted out of it, which is why
 * eight times the cells costs nowhere near eight times the work.
 *
 * `devicePixelRatio` is deliberately ignored: the sprite is drawn at its true
 * pixel size and scaled up by the renderer with nearest filtering, which is
 * what keeps the pixels square instead of blurred.
 */
export function drawTrainer(appearance: Appearance): HTMLCanvasElement {
	const phases = auraPhases(appearance)
	const canvas = document.createElement('canvas')
	canvas.width = CELL_W * FRAMES * VIEWS * phases
	canvas.height = CELL_H

	const ctx = canvas.getContext('2d')
	if (!ctx) return canvas

	ctx.imageSmoothingEnabled = false
	const color = auraColor(appearance)

	for (const [view, index] of Object.entries(VIEW_INDEX) as [View, number][]) {
		for (let frame = 0; frame < FRAMES; frame++) {
			const burning = color !== null && buildHeat(appearance, frame, view)
			for (let phase = 0; phase < phases; phase++) {
				ctx.save()
				ctx.translate(((index * FRAMES + frame) * phases + phase) * CELL_W, 0)
				if (burning) paintAura(ctx, color, phase)
				paintBody(ctx, appearance, frame, view)
				ctx.restore()
			}
		}
	}
	return canvas
}

/**
 * Draw a single cell scaled up, outside the 3D scene.
 *
 * The editor preview wants the standing front view; the battle's opening wants
 * the profile, one stride at a time, so the two trainers can be seen walking
 * on. Same art either way - the sheet the world renders from is built from
 * this very function. `phase` is the flame's own cycle, which the portrait
 * animates on its own clock so a standing trainer still burns.
 */
export function drawTrainerFrame(
	canvas: HTMLCanvasElement,
	appearance: Appearance,
	scale: number,
	view: View = 'front',
	frame = 0,
	phase = 0,
): void {
	canvas.width = CELL_W * scale
	canvas.height = CELL_H * scale

	const ctx = canvas.getContext('2d')
	if (!ctx) return

	ctx.imageSmoothingEnabled = false
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	ctx.save()
	ctx.scale(scale, scale)

	const color = auraColor(appearance)
	const pose = frame % FRAMES
	if (color !== null && buildHeat(appearance, pose, view)) {
		paintAura(ctx, color, ((phase % AURA_PHASES) + AURA_PHASES) % AURA_PHASES)
	}
	paintBody(ctx, appearance, pose, view)
	ctx.restore()
}

/** Draw a single frame scaled up, for the editor preview. */
export function drawTrainerPreview(canvas: HTMLCanvasElement, appearance: Appearance, scale: number): void {
	drawTrainerFrame(canvas, appearance, scale)
}
