import { useCallback, useEffect, useState } from 'react'

/**
 * Whether the four-step tour has been shown, remembered per account.
 *
 * Kept in `localStorage` rather than on the server: it is a property of this
 * browser's first visit, not of the trainer, and a missed tour costs nothing —
 * whereas one extra round trip before the map is usable is felt. The key
 * carries the user id so two accounts sharing a machine each get their tour.
 */
const KEY = 'pokemon:tutorial:seen'

function keyFor(userId: string | undefined) {
	return userId ? `${KEY}:${userId}` : KEY
}

function wasSeen(userId: string | undefined): boolean {
	try {
		return window.localStorage.getItem(keyFor(userId)) === '1'
	} catch {
		// Private browsing and blocked site data both throw here. Showing the
		// tour again is the harmless side of that failure.
		return false
	}
}

export interface Tutorial {
	/** The tour is asking for the screen. */
	open: boolean
	/** Mark it done and put it away. */
	finish: () => void
	/** Play it again, from the first step. */
	restart: () => void
}

/**
 * Drive the welcome tour.
 *
 * `ready` gates the first automatic opening: the steps point at the HUD and at
 * the minimap, and neither exists before the world has loaded. Pointing an
 * arrow at a tile that is not on screen yet would be worse than no tour.
 */
export function useTutorial(userId: string | undefined, ready: boolean): Tutorial {
	const [open, setOpen] = useState(false)
	const [done, setDone] = useState(() => wasSeen(userId))

	// Re-read on sign-in: the hook mounts before the account is known, so the
	// first answer above was for the anonymous key.
	useEffect(() => {
		setDone(wasSeen(userId))
	}, [userId])

	useEffect(() => {
		if (ready && !done) setOpen(true)
	}, [ready, done])

	const finish = useCallback(() => {
		setOpen(false)
		setDone(true)
		try {
			window.localStorage.setItem(keyFor(userId), '1')
		} catch {
			// Nothing to do: the tour is over for this session either way.
		}
	}, [userId])

	const restart = useCallback(() => setOpen(true), [])

	return { open, finish, restart }
}
