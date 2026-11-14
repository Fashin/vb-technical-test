import { useCallback, useEffect, useRef, useState } from 'react'

import type { Card } from './api'

/** Pause between two cards turning over. */
const STAGGER_MS = 420
/** How long the opening burst covers the panel before the first card. */
const BURST_MS = 650

export interface RevealValue {
	/** Number of cards already face-up. */
	revealed: number
	/** True while the pack burst is playing. */
	bursting: boolean
	done: boolean
	/** Turn everything over at once — the impatient path. */
	skip: () => void
}

/**
 * Drives the one-by-one reveal of a freshly opened pack.
 *
 * Honours `prefers-reduced-motion`: readers who asked for less movement get
 * the five cards immediately, with no burst and no flip. The animation is
 * decoration — the information must not depend on it.
 */
export function useReveal(cards: Card[] | null): RevealValue {
	const [revealed, setRevealed] = useState(0)
	const [bursting, setBursting] = useState(false)
	const timers = useRef<ReturnType<typeof setTimeout>[]>([])

	const clear = () => {
		timers.current.forEach(clearTimeout)
		timers.current = []
	}

	useEffect(() => {
		clear()

		if (!cards || cards.length === 0) {
			setRevealed(0)
			setBursting(false)
			return
		}

		const reduced =
			typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

		if (reduced) {
			setBursting(false)
			setRevealed(cards.length)
			return
		}

		setRevealed(0)
		setBursting(true)
		timers.current.push(setTimeout(() => setBursting(false), BURST_MS))

		cards.forEach((_, index) => {
			timers.current.push(
				setTimeout(() => setRevealed((current) => Math.max(current, index + 1)), BURST_MS + index * STAGGER_MS),
			)
		})

		return clear
	}, [cards])

	const skip = useCallback(() => {
		clear()
		setBursting(false)
		setRevealed(cards?.length ?? 0)
	}, [cards])

	return { revealed, bursting, done: !cards || revealed >= cards.length, skip }
}
