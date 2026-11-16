import { useCallback, useEffect, useRef, useState } from 'react'

import type { Ack, Appearance, TileMapData, WorldPlayerState, WorldSnapshot } from '../realtime'
import { getSocket, request } from '../realtime'

export type WorldStatus = 'connecting' | 'joined' | 'error'

export interface WorldState {
	status: WorldStatus
	error: string | null
	map: TileMapData | null
	speed: number
	/** Us, as the server last confirmed. */
	me: WorldPlayerState | null
	/** Everyone else, keyed by socket id. */
	others: Map<string, WorldPlayerState>
	/** Ask the server for one step. Our own movement is predicted locally. */
	move: (dx: number, dy: number) => void
	/** Tell the others our name or look changed, once it is saved. */
	announceProfile: (profile: { name?: string; appearance?: Appearance }) => void
	/** Set when the server refused a step; read and cleared by the renderer. */
	correction: { x: number; y: number; at: number } | null
}

/**
 * Connects to the shared overworld.
 *
 * The server is authoritative: this hook never invents a position. It sends
 * intents (`world:move`) and mirrors what comes back. Our own character is
 * still drawn optimistically by `Player`, which is what makes walking feel
 * instant; a refused step arrives as a `correction` and snaps it back.
 */
export function useWorld(enabled: boolean): WorldState {
	const [status, setStatus] = useState<WorldStatus>('connecting')
	const [error, setError] = useState<string | null>(null)
	const [map, setMap] = useState<TileMapData | null>(null)
	const [speed, setSpeed] = useState(6.5)
	const [me, setMe] = useState<WorldPlayerState | null>(null)
	const [others, setOthers] = useState<Map<string, WorldPlayerState>>(new Map())
	const [correction, setCorrection] = useState<{ x: number; y: number; at: number } | null>(null)

	// Our own socket id, needed to tell our echo apart from everyone else's.
	const selfId = useRef<string | null>(null)

	useEffect(() => {
		if (!enabled) return

		const socket = getSocket()
		let cancelled = false

		const join = async () => {
			const res = await request<Ack<WorldSnapshot>>('world:join')
			if (cancelled) return
			if (!res.ok) {
				setError(res.error.message)
				setStatus('error')
				return
			}
			const snapshot = res.data
			selfId.current = snapshot.you.id
			setMap(snapshot.map)
			setSpeed(snapshot.speed)
			setMe(snapshot.you)
			setOthers(new Map(snapshot.players.filter((p) => p.id !== snapshot.you.id).map((p) => [p.id, p])))
			setStatus('joined')
		}

		const onConnect = () => {
			setError(null)
			void join()
		}
		const onConnectError = (cause: Error) => {
			setError(cause.message === 'UNAUTHORIZED' ? 'Session expirée' : 'Serveur injoignable')
			setStatus('error')
		}
		const onDisconnect = () => setStatus('connecting')

		const onJoined = (player: WorldPlayerState) => {
			setOthers((current) => new Map(current).set(player.id, player))
		}

		const onMoved = ({ id, x, y, facing }: { id: string; x: number; y: number; facing: 'left' | 'right' }) => {
			if (id === selfId.current) {
				setMe((current) => (current ? { ...current, x, y, facing } : current))
				return
			}
			setOthers((current) => {
				const player = current.get(id)
				if (!player) return current
				return new Map(current).set(id, { ...player, x, y, facing })
			})
		}

		const onRejected = ({ x, y }: { x: number; y: number }) => {
			setMe((current) => (current ? { ...current, x, y } : current))
			setCorrection({ x, y, at: Date.now() })
		}

		const onProfile = ({ id, name, appearance }: { id: string; name: string; appearance: Appearance }) => {
			if (id === selfId.current) {
				setMe((current) => (current ? { ...current, name, appearance } : current))
				return
			}
			setOthers((current) => {
				const player = current.get(id)
				if (!player) return current
				return new Map(current).set(id, { ...player, name, appearance })
			})
		}

		const onTaken = () => {
			// Another window of this account just took the character over. One
			// account walks one trainer, so this view stops here instead of
			// drawing a world it no longer steers — and says why, rather than
			// freezing on a character that ignores the keyboard.
			setOthers(new Map())
			setError('Personnage repris dans une autre fenêtre')
			setStatus('error')
		}

		const onLeft = ({ id }: { id: string }) => {
			setOthers((current) => {
				if (!current.has(id)) return current
				const next = new Map(current)
				next.delete(id)
				return next
			})
		}

		socket.on('connect', onConnect)
		socket.on('connect_error', onConnectError)
		socket.on('disconnect', onDisconnect)
		socket.on('world:joined', onJoined)
		socket.on('world:moved', onMoved)
		socket.on('world:rejected', onRejected)
		socket.on('world:profile', onProfile)
		socket.on('world:left', onLeft)
		socket.on('world:taken', onTaken)

		if (socket.connected) void join()
		else socket.connect()

		return () => {
			cancelled = true
			socket.off('connect', onConnect)
			socket.off('connect_error', onConnectError)
			socket.off('disconnect', onDisconnect)
			socket.off('world:joined', onJoined)
			socket.off('world:moved', onMoved)
			socket.off('world:rejected', onRejected)
			socket.off('world:profile', onProfile)
			socket.off('world:left', onLeft)
			socket.off('world:taken', onTaken)
			if (socket.connected) socket.emit('world:leave')
		}
	}, [enabled])

	const move = useCallback((dx: number, dy: number) => {
		const socket = getSocket()
		if (socket.connected) socket.emit('world:move', { dx, dy })
	}, [])

	const announceProfile = useCallback((profile: { name?: string; appearance?: Appearance }) => {
		// Reflect it locally at once; the server echoes the stored version back
		// through `world:profile` for everyone, us included.
		setMe((current) => (current ? { ...current, ...profile } : current))
		const socket = getSocket()
		if (socket.connected) socket.emit('world:profile')
	}, [])

	return { status, error, map, speed, me, others, move, correction, announceProfile }
}
