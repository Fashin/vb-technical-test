import { useEffect, useRef } from 'react'

import type { Appearance } from './appearance'
import { drawTrainerFrame, type View } from './drawTrainer'

/**
 * A trainer drawn into a canvas, outside the 3D scene.
 *
 * Shared by the barber's preview, the arena's roster and the battle's opening
 * so a master's portrait is the very sprite that would walk the map, not a
 * separate illustration that could drift from it. `view` and `frame` are what
 * let the opening animate: the profile art, one stride at a time.
 */
export function TrainerPortrait({
	appearance,
	scale,
	label,
	className,
	view = 'front',
	frame = 0,
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
}) {
	const canvas = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		if (canvas.current) drawTrainerFrame(canvas.current, appearance, scale, view, frame)
	}, [appearance, scale, view, frame])

	return (
		<canvas
			ref={canvas}
			role="img"
			aria-label={label}
			className={`[image-rendering:pixelated] ${className ?? ''}`}
		/>
	)
}
