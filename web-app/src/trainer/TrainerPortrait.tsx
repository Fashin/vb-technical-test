import { useEffect, useRef, useState } from 'react'

import type { Appearance } from './appearance'
import {
	AURA_FPS,
	AURA_PHASES,
	FRAME_H,
	FRAME_W,
	PAD_TOP,
	PAD_X,
	drawTrainerFrame,
	type View,
} from './drawTrainer'

/**
 * A trainer drawn into a canvas, outside the 3D scene.
 *
 * Shared by the barber's preview, the arena's roster and the battle's opening
 * so a master's portrait is the very sprite that would walk the map, not a
 * separate illustration that could drift from it. `view` and `frame` are what
 * let the opening animate: the profile art, one stride at a time.
 *
 * A trainer with an aura burns here too, on a clock of its own: the barber's
 * preview is where you choose the thing, so it had better be alight. The
 * canvas is the full padded cell, which is wider and a good deal taller than
 * the body - the flames need the room, and a framed preview wants them inside
 * the frame.
 *
 * `bleed` is for the callers that cannot afford that: the one laid out against
 * fixed rails, and the compact list. It keeps the element the size of the body
 * alone, exactly as it was before the aura grew, and lets the flames spill out
 * of it. Same picture either way; only the box differs.
 */
export function TrainerPortrait({
	appearance,
	scale,
	label,
	className,
	view = 'front',
	frame = 0,
	bleed = false,
}: {
	appearance: Appearance
	/** Pixel size of one sprite pixel. */
	scale: number
	/** Accessible description; the canvas is otherwise unreadable. */
	label: string
	className?: string
	/** Which way the trainer is turned; `side` is the profile, facing right. */
	view?: View
	/** 0 = standing, 1 and 2 are the two stride poses of the walk cycle. */
	frame?: number
	/** Keep the layout box the size of the body and let the aura overflow it. */
	bleed?: boolean
}) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const [phase, setPhase] = useState(0)

	// Nothing to animate for a trainer without an aura: the body art is the
	// same in every phase, so redrawing it ten times a second would be work
	// for an identical picture.
	const burning = appearance.aura > 0

	useEffect(() => {
		if (!burning) return

		let raf = 0
		let last = 0
		const step = 1000 / AURA_FPS
		const tick = (now: number) => {
			if (now - last >= step) {
				last = now
				setPhase((current) => (current + 1) % AURA_PHASES)
			}
			raf = requestAnimationFrame(tick)
		}
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [burning])

	useEffect(() => {
		if (canvas.current) drawTrainerFrame(canvas.current, appearance, scale, view, frame, phase)
	}, [appearance, scale, view, frame, phase])

	const picture = (
		<canvas
			ref={canvas}
			role="img"
			aria-label={label}
			className={`[image-rendering:pixelated] ${bleed ? 'absolute' : ''} ${className ?? ''}`}
			style={bleed ? { left: -PAD_X * scale, top: -PAD_TOP * scale } : undefined}
		/>
	)

	if (!bleed) return picture

	return (
		<span
			className="relative block"
			style={{ width: FRAME_W * scale, height: FRAME_H * scale }}
		>
			{picture}
		</span>
	)
}
