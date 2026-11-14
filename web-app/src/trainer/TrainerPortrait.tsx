import { useEffect, useRef } from 'react'

import type { Appearance } from './appearance'
import { drawTrainerPreview } from './drawTrainer'

/**
 * A trainer drawn into a canvas, outside the 3D scene.
 *
 * Shared by the barber's preview and the arena's roster so a master's portrait
 * is the very sprite that would walk the map, not a separate illustration that
 * could drift from it.
 */
export function TrainerPortrait({
	appearance,
	scale,
	label,
	className,
}: {
	appearance: Appearance
	/** Pixel size of one sprite pixel. */
	scale: number
	/** Accessible description; the canvas is otherwise unreadable. */
	label: string
	className?: string
}) {
	const canvas = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		if (canvas.current) drawTrainerPreview(canvas.current, appearance, scale)
	}, [appearance, scale])

	return (
		<canvas
			ref={canvas}
			role="img"
			aria-label={label}
			className={`[image-rendering:pixelated] ${className ?? ''}`}
		/>
	)
}
