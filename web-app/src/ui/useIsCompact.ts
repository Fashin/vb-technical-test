import { useEffect, useState } from 'react'

/**
 * Screens that need the touch layout: a virtual joystick, a side menu instead
 * of the icon bar, and a smaller minimap.
 *
 * Each half catches something the others miss. `pointer: coarse` catches phones
 * and tablets, where there is no keyboard to walk with whatever the screen
 * size. The width catches a narrow desktop window, and the height a landscape
 * phone or a short one: in both the eight-icon bar and a 360px minimap cover
 * the map even though the arrow keys still work. Any one of them is enough.
 */
const QUERY = '(pointer: coarse), (max-width: 820px), (max-height: 540px)'

function matches(): boolean {
	// `matchMedia` is missing in jsdom and in very old browsers; the desktop
	// layout is the safe answer there, since it needs no touch to be usable.
	if (typeof window === 'undefined' || !window.matchMedia) return false
	return window.matchMedia(QUERY).matches
}

/** Whether the touch/narrow layout should be used. Re-evaluated on rotation. */
export function useIsCompact(): boolean {
	const [compact, setCompact] = useState(matches)

	useEffect(() => {
		if (!window.matchMedia) return
		const list = window.matchMedia(QUERY)
		const update = () => setCompact(list.matches)

		update()
		// `addEventListener` on a MediaQueryList is unsupported on Safari < 14,
		// which is still a plausible phone — fall back to the legacy callback.
		if (list.addEventListener) {
			list.addEventListener('change', update)
			return () => list.removeEventListener('change', update)
		}
		list.addListener(update)
		return () => list.removeListener(update)
	}, [])

	return compact
}
