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
	/**
	 * True when the cards on screen came from « Tout ouvrir ». The reveal plays
	 * no burst and no flip for them: a dozen packs opened in one go is a
	 * summary, not a ceremony.
	 */
	instant: boolean
	/** Lucky packs waiting, best first, and the leftover shards. */
	lucky: BoosterState['lucky']
	shards: number
	opening: boolean
	error: string | null
	open: () => Promise<void>
	/**
	 * Spend the whole free stock in one go and show every card at once.
	 *
	 * Only the packs the clock handed out: lucky ones cost recycled cards, and
	 * emptying that stock behind a single click is the kind of loss nobody
	 * asked for.
	 */
	openAll: () => Promise<void>
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

/** Floor between two countdown-driven refetches, whatever the server says. */
const REFRESH_COOLDOWN_MS = 5000

/**
 * Booster stock and countdown.
 *
 * The server owns the clock: it says how long is left, this hook counts that
 * delay down against the local clock and asks again when it closes. Nothing
 * here decides when a pack is earned, and nothing compares a server timestamp
 * to a browser one — see `nextInMs` in `api.ts`.
 */
export function useBoosters(enabled: boolean): BoostersValue {
	const [state, setState] = useState<BoosterState | null>(null)
	const [remainingMs, setRemainingMs] = useState<number | null>(null)
	const [cards, setCards] = useState<Card[] | null>(null)
	const [openedLuck, setOpenedLuck] = useState(0)
	const [instant, setInstant] = useState(false)
	const [opening, setOpening] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Guards the refetch fired when the countdown reaches zero, so a slow
	// response cannot queue a second one every tick.
	const refreshing = useRef(false)

	/**
	 * When the next pack is due, on this browser's clock.
	 *
	 * Set from the delay the server reports, at the moment the answer lands, so
	 * a machine whose clock disagrees with the server's still counts down the
	 * right number of seconds. A ref rather than state: the countdown reads it
	 * without the effect having to restart on every refresh.
	 */
	const dueAt = useRef<number | null>(null)

	const lastRefreshAt = useRef(0)

	const applyState = useCallback((next: BoosterState) => {
		dueAt.current = next.nextInMs === null ? null : Date.now() + next.nextInMs
		setState(next)
	}, [])

	/**
	 * `due` marks the automatic refetch the countdown fires on its own. It is
	 * rate-limited, because it is the one call nobody asked for: a server that
	 * reported a delay of zero would otherwise have this hook asking again on
	 * every tick, for as long as the panel stays open. A refresh triggered by
	 * the player, or by an arena win paying out, is never delayed.
	 */
	const refresh = useCallback(
		async (due = false) => {
			if (refreshing.current) return
			if (due && Date.now() - lastRefreshAt.current < REFRESH_COOLDOWN_MS) return
			refreshing.current = true
			lastRefreshAt.current = Date.now()
			try {
				const { state: next } = await api.fetchState()
				applyState(next)
				setError(null)
			} catch (cause) {
				setError(cause instanceof api.BoosterError ? cause.message : 'Serveur injoignable')
			} finally {
				refreshing.current = false
			}
		},
		[applyState],
	)

	useEffect(() => {
		if (!enabled) return
		void refresh()
	}, [enabled, refresh])

	/**
	 * `waiting` is a boolean, not the state object, and that is the point: the
	 * countdown restarts only when the stock goes from filling to full or back,
	 * not on every answer the server sends. Depending on `state` here meant
	 * each refresh remounted the interval and ticked it immediately, so a
	 * countdown that read as expired re-fetched as fast as the network allowed
	 * instead of once a second.
	 */
	const waiting = state !== null && state.nextInMs !== null

	useEffect(() => {
		if (!enabled) return

		if (!waiting) {
			setRemainingMs(null)
			return
		}

		const tick = () => {
			const left = (dueAt.current ?? 0) - Date.now()
			setRemainingMs(Math.max(0, left))
			// The pack is due: let the server confirm it rather than assume it.
			if (left <= 0) void refresh(true)
		}

		tick()
		const timer = setInterval(tick, 1000)
		return () => clearInterval(timer)
	}, [enabled, waiting, refresh])

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
				setInstant(false)
				setCards(result.cards)
				setOpenedLuck(result.luck)
				// Through `applyState`, not `setState`: spending a pack restarts the
				// countdown, and the deadline has to move with it.
				applyState(result.state)
			} catch (cause) {
				setError(cause instanceof api.BoosterError ? cause.message : 'Serveur injoignable')
				// A refused open usually means our stock was stale.
				void refresh()
			} finally {
				setOpening(false)
			}
		},
		[refresh, applyState],
	)

	const open = useCallback(() => spend(api.openBooster), [spend])
	const openLucky = useCallback(() => spend(api.openLuckyBooster), [spend])

	/**
	 * Open every pending pack, one request after another.
	 *
	 * The server opens a single pack per call, so this walks the stock down and
	 * trusts the count it sends back rather than the one the panel started
	 * with — another tab, or an arena win, may have changed it mid-way. A
	 * failure stops the walk but keeps whatever already came back: those packs
	 * are spent and their cards are in the collection.
	 */
	const openAll = useCallback(async () => {
		setOpening(true)
		setError(null)
		const drawn: Card[] = []
		try {
			// Bounded by the stock the server reports after each open, so a
			// server that stopped decrementing cannot loop forever.
			let left = state?.pending ?? 0
			while (left > 0) {
				const result = await api.openBooster()
				drawn.push(...result.cards)
				applyState(result.state)
				left = Math.min(left - 1, result.state.pending)
			}
		} catch (cause) {
			setError(cause instanceof api.BoosterError ? cause.message : 'Serveur injoignable')
			void refresh()
		} finally {
			if (drawn.length > 0) {
				setInstant(true)
				setOpenedLuck(0)
				setCards(drawn)
			}
			setOpening(false)
		}
	}, [state, applyState, refresh])

	const dismiss = useCallback(() => {
		setCards(null)
		setInstant(false)
	}, [])

	return {
		state,
		remainingMs,
		cards,
		openedLuck,
		instant,
		lucky: state?.lucky ?? [],
		shards: state?.shards ?? 0,
		opening,
		error,
		open,
		openAll,
		openLucky,
		dismiss,
		refresh: () => void refresh(),
	}
}
