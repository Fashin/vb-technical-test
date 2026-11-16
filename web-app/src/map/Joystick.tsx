import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import type { Direction } from './usePlayerControls'

/** Side of the base, in pixels. Sized for a thumb, not for a cursor. */
const BASE = 128
/** Side of the knob. */
const KNOB = 56
/** Radius the knob is allowed to travel from the centre. */
const TRAVEL = (BASE - KNOB) / 2
/**
 * Fraction of the travel below which the stick reads as centred. Without it a
 * thumb resting on the base would walk the trainer on its own.
 */
const DEAD_ZONE = 0.3

/**
 * Eight directions, by octant of the angle. Index 0 is due east and they turn
 * clockwise, because the screen's Y axis points down.
 *
 * A diagonal yields two directions: `Player` reads one per axis from `held`,
 * so that is exactly what produces a diagonal step.
 */
const OCTANTS: Direction[][] = [
	['right'],
	['right', 'down'],
	['down'],
	['left', 'down'],
	['left'],
	['left', 'up'],
	['up'],
	['right', 'up'],
]

function directionsFor(dx: number, dy: number): Direction[] {
	const octant = ((Math.round((Math.atan2(dy, dx) * 4) / Math.PI) % 8) + 8) % 8
	return OCTANTS[octant]
}

export interface JoystickProps {
	/** The same refs the keyboard writes: one input path into the scene. */
	held: MutableRefObject<Direction[]>
	tapped: MutableRefObject<Direction | null>
	className?: string
}

/**
 * Virtual thumbstick for touch screens.
 *
 * It writes into the very refs `usePlayerControls` exposes to the keyboard, so
 * the scene has nothing to know about it: holding the stick north is holding
 * the up arrow, and a quick flick lands in `tapped` the same way a sub-frame
 * key press does.
 *
 * Pointer events rather than touch events, so it also answers a mouse (handy
 * for testing the mobile layout in a desktop browser). The pointer is captured
 * on contact: the thumb can slide outside the base — and it will — without the
 * trainer stopping mid-stride.
 */
export function Joystick({ held, tapped, className }: JoystickProps) {
	const base = useRef<HTMLDivElement>(null)
	const origin = useRef<{ x: number; y: number } | null>(null)
	const [knob, setKnob] = useState<{ x: number; y: number } | null>(null)

	/** Never leave a direction stuck down when the stick goes away. */
	useEffect(
		() => () => {
			held.current = []
		},
		[held],
	)

	const release = useCallback(() => {
		origin.current = null
		held.current = []
		setKnob(null)
	}, [held])

	const aim = useCallback(
		(clientX: number, clientY: number) => {
			const centre = origin.current
			if (!centre) return

			const dx = clientX - centre.x
			const dy = clientY - centre.y
			const distance = Math.hypot(dx, dy)
			const reach = Math.min(distance, TRAVEL)

			// The knob follows the thumb even inside the dead zone, so the stick
			// never looks frozen while it is deliberately doing nothing.
			setKnob(distance > 0 ? { x: (dx / distance) * reach, y: (dy / distance) * reach } : { x: 0, y: 0 })

			if (distance < TRAVEL * DEAD_ZONE) {
				held.current = []
				return
			}

			const directions = directionsFor(dx, dy)
			held.current = directions
			// A flick that starts and ends between two frames leaves nothing held;
			// `tapped` is what turns it into a single step anyway.
			tapped.current = directions[0]
		},
		[held, tapped],
	)

	const grab = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const node = base.current
			if (!node) return

			const rect = node.getBoundingClientRect()
			origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
			// Keeps the move events coming after the thumb leaves the base, and
			// stops the browser from treating the drag as a scroll.
			node.setPointerCapture(event.pointerId)
			aim(event.clientX, event.clientY)
		},
		[aim],
	)

	return (
		<div
			ref={base}
			aria-hidden="true"
			onPointerDown={grab}
			onPointerMove={(event) => {
				if (origin.current) aim(event.clientX, event.clientY)
			}}
			onPointerUp={release}
			onPointerCancel={release}
			onLostPointerCapture={release}
			onContextMenu={(event) => event.preventDefault()}
			data-tutorial="joystick"
			className={`pointer-events-auto absolute select-none touch-none rounded-full border border-white/20 bg-black/40 backdrop-blur ${className ?? ''}`}
			style={{ width: BASE, height: BASE }}
		>
			{/* The four hints, so the stick reads as a direction pad at a glance. */}
			<span className="absolute inset-0 rounded-full border border-white/10" />
			<div
				className="absolute rounded-full border border-emerald-300/50 bg-emerald-400/30 shadow-lg transition-[background-color] duration-150"
				style={{
					width: KNOB,
					height: KNOB,
					left: '50%',
					top: '50%',
					transform: `translate(calc(-50% + ${knob?.x ?? 0}px), calc(-50% + ${knob?.y ?? 0}px))`,
					backgroundColor: knob ? undefined : 'rgba(255,255,255,0.14)',
				}}
			/>
		</div>
	)
}
