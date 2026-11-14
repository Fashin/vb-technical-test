import { useCallback, useEffect, useRef, useState } from 'react'

import * as api from './api'
import type { BoosterState, Card } from './api'

export interface BoostersValue {
	state: BoosterState | null
	/** Milliseconds until the next pack, recomputed every second. */
	remainingMs: number | null
	cards: Card[] | null
	opening: boolean
	error: string | null
	open: () => Promise<void>
	/** Put the reveal away and go back to the stock. */
	dismiss: () => void
}

/**
 * Booster stock and countdown.
 *
 * The server owns the clock: this hook only renders the gap between now and
 * the `nextAt` it was given, and asks again when that gap closes. Nothing here
 * decides when a pack is earned.
 */
export function useBoosters(enabled: boolean): BoostersValue {
	const [state, setState] = useState<BoosterState | null>(null)
	const [remainingMs, setRemainingMs] = useState<number | null>(null)
	const [cards, setCards] = useState<Card[] | null>(null)
	const [opening, setOpening] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Guards the refetch fired when the countdown reaches zero, so a slow
	// response cannot queue a second one every tick.
	const refreshing = useRef(false)

	const refresh = useCallback(async () => {
		if (refreshing.current) return
		refreshing.current = true
		try {
			const { state: next } = await api.fetchState()
			setState(next)
			setError(null)
		} catch (cause) {
			setError(cause instanceof api.BoosterError ? cause.message : 'Serveur injoignable')
		} finally {
			refreshing.current = false
		}
	}, [])

	useEffect(() => {
		if (!enabled) return
		void refresh()
	}, [enabled, refresh])

	useEffect(() => {
		if (!enabled || !state) return

		if (state.nextAt === null) {
			setRemainingMs(null)
			return
		}

		const tick = () => {
			const left = state.nextAt! - Date.now()
			setRemainingMs(Math.max(0, left))
			// The pack is due: let the server confirm it rather than assume it.
			if (left <= 0) void refresh()
		}

		tick()
		const timer = setInterval(tick, 1000)
		return () => clearInterval(timer)
	}, [enabled, state, refresh])

	const open = useCallback(async () => {
		setOpening(true)
		setError(null)
		try {
			const result = await api.openBooster()
			setCards(result.cards)
			setState(result.state)
		} catch (cause) {
			setError(cause instanceof api.BoosterError ? cause.message : 'Serveur injoignable')
			// A refused open usually means our stock was stale.
			void refresh()
		} finally {
			setOpening(false)
		}
	}, [refresh])

	const dismiss = useCallback(() => setCards(null), [])

	return { state, remainingMs, cards, opening, error, open, dismiss }
}
