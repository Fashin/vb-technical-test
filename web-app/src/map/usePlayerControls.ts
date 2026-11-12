import { useCallback, useMemo, useRef } from 'react'

export type Direction = 'up' | 'down' | 'left' | 'right'

/** Matched on `event.code`, so the physical key wins over the layout. */
const BY_CODE: Record<string, Direction> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
	KeyW: 'up',
	KeyS: 'down',
	KeyA: 'left',
	KeyD: 'right',
	// AZERTY
	KeyZ: 'up',
	KeyQ: 'left',
}

/**
 * Fallback on `event.key`. Some synthetic events (automation, a few IMEs and
 * on-screen keyboards) arrive without a `code`, and the player would then be
 * stuck with a map that swallows nothing.
 */
const BY_KEY: Record<string, Direction> = {
	arrowup: 'up',
	arrowdown: 'down',
	arrowleft: 'left',
	arrowright: 'right',
	w: 'up',
	s: 'down',
	a: 'left',
	d: 'right',
	z: 'up',
	q: 'left',
}

function directionOf(event: React.KeyboardEvent): Direction | undefined {
	return BY_CODE[event.code] ?? BY_KEY[(event.key ?? '').toLowerCase()]
}

/**
 * Keyboard state for the overworld.
 *
 * The handlers go on a focusable wrapper rather than on `window`: the map is
 * embedded in a scrolling page, so arrow keys must only be captured once the
 * player has clicked the map.
 */
export function usePlayerControls() {
	const held = useRef<Direction[]>([])
	/**
	 * Last direction pressed, kept until the scene consumes it. A tap shorter
	 * than one frame would otherwise be pressed and released between two
	 * renders and never produce a step.
	 */
	const tapped = useRef<Direction | null>(null)

	const onKeyDown = useCallback((event: React.KeyboardEvent) => {
		const direction = directionOf(event)
		if (!direction) return
		event.preventDefault()
		// Last key pressed wins, so a diagonal input still picks one axis.
		held.current = [direction, ...held.current.filter((d) => d !== direction)]
		tapped.current = direction
	}, [])

	const onKeyUp = useCallback((event: React.KeyboardEvent) => {
		const direction = directionOf(event)
		if (!direction) return
		event.preventDefault()
		held.current = held.current.filter((d) => d !== direction)
	}, [])

	/** Dropping focus must not leave a key stuck down. */
	const onBlur = useCallback(() => {
		held.current = []
	}, [])

	return useMemo(
		() => ({ held, tapped, onKeyDown, onKeyUp, onBlur }),
		[onKeyDown, onKeyUp, onBlur],
	)
}
