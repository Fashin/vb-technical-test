import { useCallback, useEffect, useRef, useState } from 'react'

import * as api from './api'
import type { BoosterState, Card } from './api'

export interface BoostersValue {
	state: BoosterState | null
	/** Milliseconds until the next pack, recomputed every second. */
	remainingMs: number | null
	cards: Card[] | null
	/**
	 * Luck the pack on screen was drawn with, in percentage points — 0 for one
	 * the clock handed out. The reveal says so, otherwise a recycled pack would
	 * look exactly like a free one and the trade would feel like nothing.
	 */
	openedLuck: number
	/** Lucky packs waiting, best first, and the leftover shards. */
	lucky: BoosterState['lucky']
	shards: number
	opening: boolean
	error: string | null
	open: () => Promise<void>
	/** Open the best pack the recycled duplicates bought. */
	openLucky: () => Promise<void>
	/** Put the reveal away and go back to the stock. */
	dismiss: () => void
	/**
	 * Re-read the stock from the server.
	 *
	 * Boosters are not only earned by waiting — winning in the arena credits
	 * them too — so anything that might have changed the count calls this
	 * rather than letting the panel show what it loaded at startup.
	 */
	refresh: () => void
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
	const [openedLuck, setOpenedLuck] = useState(0)
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

	/**
	 * One opener for both stocks.
	 *
	 * The two differ by which pack is spent, nothing else: the same five cards
	 * come back, the same reveal plays them, and the luck the server applied
	 * comes back with them rather than being guessed from which button was
	 * pressed.
	 */
	const spend = useCallback(
		async (ask: () => Promise<{ cards: Card[]; state: api.BoosterState; luck: number }>) => {
			setOpening(true)
			setError(null)
			try {
				const result = await ask()
				setCards(result.cards)
				setOpenedLuck(result.luck)
				setState(result.state)
			} catch (cause) {
				setError(cause instanceof api.BoosterError ? cause.message : 'Serveur injoignable')
				// A refused open usually means our stock was stale.
				void refresh()
			} finally {
				setOpening(false)
			}
		},
		[refresh],
	)

	const open = useCallback(() => spend(api.openBooster), [spend])
	const openLucky = useCallback(() => spend(api.openLuckyBooster), [spend])

	const dismiss = useCallback(() => setCards(null), [])

	return {
		state,
		remainingMs,
		cards,
		openedLuck,
		lucky: state?.lucky ?? [],
		shards: state?.shards ?? 0,
		opening,
		error,
		open,
		openLucky,
		dismiss,
		refresh: () => void refresh(),
	}
}
