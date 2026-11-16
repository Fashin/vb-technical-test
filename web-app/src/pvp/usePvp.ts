import { useCallback, useEffect, useState } from 'react'

import type { Battle } from '../battle'
import type { XpGain } from '../progression'
import {
	getSocket,
	type EncounterKind,
	type Invitation,
	type RealtimeError,
	type ServerToClientEvents,
	type TradeState,
} from '../realtime'

/**
 * Encounters with other players: one subscription for the whole feature.
 *
 * Duels and trades share an invitation, a neighbour and a socket, so they
 * share a hook rather than racing each other for the same events. As
 * everywhere else in this app the server is authoritative: this hook sends
 * intents and mirrors what comes back, and never decides anything itself —
 * not who won, not who owns which card.
 */

export interface DuelResult {
	battle: Battle
	won: boolean
	gains: XpGain[]
	degraded: boolean
}

/** The `pvp:accepted` payload, kept as the server sends it. */
type Accepted = Parameters<ServerToClientEvents['pvp:accepted']>[0]

export interface PvpState {
	/** An invitation waiting for an answer, if any. */
	invitation: Invitation | null
	/** Set while an invitation of ours is waiting for an answer. */
	awaiting: EncounterKind | null
	/**
	 * Set once a duel has been accepted and is being written, with everything
	 * the opening needs: who the other player is, what they look like, and the
	 * Pokemon each side will lead with.
	 *
	 * Distinct from `awaiting` on purpose: "nobody has answered yet" and "it is
	 * on, the chatbot is writing it" are two different waits, and showing one
	 * for the other is what made an accepted duel look like a broken one.
	 */
	resolving: Accepted | null
	duel: DuelResult | null
	trade: TradeState | null
	/** True once a trade has gone through; the panel shows the result. */
	traded: boolean
	error: string | null
}

const EMPTY: PvpState = {
	invitation: null,
	awaiting: null,
	resolving: null,
	duel: null,
	trade: null,
	traded: false,
	error: null,
}

export function usePvp() {
	const [state, setState] = useState<PvpState>(EMPTY)

	useEffect(() => {
		const socket = getSocket()

		const onInvited = (invitation: Invitation) => setState((s) => ({ ...s, invitation, error: null }))

		const onCancelled = () =>
			setState((s) => ({ ...s, invitation: null, awaiting: null, resolving: null }))

		const onError = (error: RealtimeError) =>
			setState((s) => ({ ...s, awaiting: null, resolving: null, error: error.message }))

		const onAccepted = (payload: Accepted) =>
			setState((s) => ({ ...s, resolving: payload, awaiting: null, invitation: null, error: null }))

		const onDuel = (duel: DuelResult) =>
			setState((s) => ({ ...s, duel, awaiting: null, resolving: null, invitation: null, error: null }))

		const onTrade = (trade: TradeState) =>
			setState((s) => ({
				...s,
				trade,
				traded: false,
				awaiting: null,
				resolving: null,
				invitation: null,
				error: null,
			}))

		const onTradeDone = (trade: TradeState) => setState((s) => ({ ...s, trade, traded: true }))

		const onTradeClosed = () => setState((s) => ({ ...s, trade: null, traded: false }))

		socket.on('pvp:invited', onInvited)
		socket.on('pvp:cancelled', onCancelled)
		socket.on('pvp:error', onError)
		socket.on('pvp:accepted', onAccepted)
		socket.on('pvp:duel', onDuel)
		socket.on('trade:state', onTrade)
		socket.on('trade:done', onTradeDone)
		socket.on('trade:closed', onTradeClosed)

		return () => {
			socket.off('pvp:invited', onInvited)
			socket.off('pvp:cancelled', onCancelled)
			socket.off('pvp:error', onError)
			socket.off('pvp:accepted', onAccepted)
			socket.off('pvp:duel', onDuel)
			socket.off('trade:state', onTrade)
			socket.off('trade:done', onTradeDone)
			socket.off('trade:closed', onTradeClosed)
		}
	}, [])

	const invite = useCallback((toUserId: string, kind: EncounterKind) => {
		setState((s) => ({ ...s, awaiting: kind, error: null }))
		getSocket().emit('pvp:invite', { toUserId, kind }, (res) => {
			if (!res.ok) setState((s) => ({ ...s, awaiting: null, error: res.error.message }))
		})
	}, [])

	const respond = useCallback((invitationId: string, accept: boolean, kind: EncounterKind) => {
		setState((s) => ({ ...s, invitation: null, awaiting: accept ? kind : null }))
		getSocket().emit('pvp:respond', { invitationId, accept })
	}, [])

	const offer = useCallback((cardIds: string[]) => {
		getSocket().emit('trade:offer', { cardIds }, (res) => {
			if (!res.ok) setState((s) => ({ ...s, error: res.error.message }))
		})
	}, [])

	const confirm = useCallback((confirmed: boolean) => {
		getSocket().emit('trade:confirm', { confirmed }, (res) => {
			if (!res.ok) setState((s) => ({ ...s, error: res.error.message }))
		})
	}, [])

	const leaveTrade = useCallback(() => {
		getSocket().emit('trade:leave')
		setState((s) => ({ ...s, trade: null, traded: false }))
	}, [])

	const dismissDuel = useCallback(() => setState((s) => ({ ...s, duel: null })), [])
	const dismissError = useCallback(() => setState((s) => ({ ...s, error: null })), [])

	return { ...state, invite, respond, offer, confirm, leaveTrade, dismissDuel, dismissError }
}
