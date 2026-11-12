import { useCallback, useEffect, useState } from 'react'

import type { Ack, RealtimeError, RoomState } from './events'
import { getSocket, request } from './socket'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

/**
 * Single entry point for the multiplayer lobby.
 *
 * The server is authoritative: this hook never mutates the room itself, it only
 * mirrors the `room:state` snapshots it receives and forwards player intents.
 */
export function useArenaRoom() {
	const [status, setStatus] = useState<ConnectionStatus>('idle')
	const [room, setRoom] = useState<RoomState | null>(null)
	const [error, setError] = useState<RealtimeError | null>(null)
	const [battleStarted, setBattleStarted] = useState(false)

	useEffect(() => {
		const socket = getSocket()

		const onConnect = () => setStatus('connected')
		const onDisconnect = () => setStatus('idle')
		const onConnectError = () => setStatus('error')
		const onState = (next: RoomState) => setRoom(next)
		const onError = (next: RealtimeError) => setError(next)
		const onBattleStart = () => setBattleStarted(true)
		const onClosed = () => {
			setBattleStarted(false)
		}

		socket.on('connect', onConnect)
		socket.on('disconnect', onDisconnect)
		socket.on('connect_error', onConnectError)
		socket.on('room:state', onState)
		socket.on('room:error', onError)
		socket.on('battle:start', onBattleStart)
		socket.on('room:closed', onClosed)

		if (!socket.connected) {
			setStatus('connecting')
			socket.connect()
		} else {
			setStatus('connected')
		}

		return () => {
			socket.off('connect', onConnect)
			socket.off('disconnect', onDisconnect)
			socket.off('connect_error', onConnectError)
			socket.off('room:state', onState)
			socket.off('room:error', onError)
			socket.off('battle:start', onBattleStart)
			socket.off('room:closed', onClosed)
		}
	}, [])

	/** Run an acked emit and surface the failure instead of throwing. */
	const send = useCallback(async <T,>(run: () => Promise<Ack<T>>): Promise<Ack<T>> => {
		setError(null)
		const res = await run()
		if (!res.ok) setError(res.error)
		return res
	}, [])

	const createRoom = useCallback(
		(playerName: string) =>
			send(() => request<Ack<RoomState>>('room:create', { playerName })).then((res) => {
				if (res.ok) setRoom(res.data)
				return res
			}),
		[send],
	)

	const joinRoom = useCallback(
		(roomId: string, playerName: string) =>
			send(() => request<Ack<RoomState>>('room:join', { roomId, playerName })).then((res) => {
				if (res.ok) setRoom(res.data)
				return res
			}),
		[send],
	)

	const pick = useCallback(
		(pokedexId: number) => send(() => request<Ack<RoomState>>('room:pick', { pokedexId })),
		[send],
	)

	const setReady = useCallback(
		(ready: boolean) => send(() => request<Ack<RoomState>>('room:ready', { ready })),
		[send],
	)

	const leaveRoom = useCallback(async () => {
		await request<Ack<null>>('room:leave')
		setRoom(null)
		setBattleStarted(false)
	}, [])

	const me = room?.players.find((p) => p.id === getSocket().id) ?? null
	const opponent = room?.players.find((p) => p.id !== getSocket().id) ?? null

	return { status, room, me, opponent, error, battleStarted, createRoom, joinRoom, pick, setReady, leaveRoom }
}
