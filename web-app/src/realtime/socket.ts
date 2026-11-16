import { io, type Socket } from 'socket.io-client'

import { readToken } from '../auth/api'
import type { ClientToServerEvents, ServerToClientEvents } from './events'

export type ArenaSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const REALTIME_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

let socket: ArenaSocket | null = null

/**
 * Lazily created singleton: socket.io keeps one multiplexed connection for the
 * whole tab, so components share this instance instead of each opening their own.
 * `autoConnect` is off — nothing connects until a signed-in player enters the world.
 */
export function getSocket(): ArenaSocket {
	if (!socket) {
		socket = io(REALTIME_URL, {
			autoConnect: false,
			transports: ['websocket', 'polling'],
			// Read at every (re)connection attempt, so a token refreshed after a
			// new sign-in is picked up without recreating the socket.
			auth: (cb) => cb({ token: readToken() }),
		})
	}
	return socket
}

/**
 * Promisified `emit` with ack, so callers can `await` a server answer.
 *
 * The timeout is the point: without one, a socket that is connected but no
 * longer answering — a proxy that holds the connection open, a server mid
 * restart, a laptop coming back from sleep — leaves the promise pending for
 * ever and the panel that awaited it stuck on "Chargement…" with no way out.
 * Resolving with a failed ack instead means every caller's existing error path
 * handles it, since every ack in `ClientToServerEvents` is an `Ack<T>`.
 */
export function request<R>(event: keyof ClientToServerEvents, payload?: unknown, timeout = 10_000): Promise<R> {
	return new Promise((resolve) => {
		let settled = false
		const settle = (res: unknown) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve(res as R)
		}

		const timer = setTimeout(
			() => settle({ ok: false, error: { code: 'TIMEOUT', message: 'Serveur injoignable' } }),
			timeout,
		)

		// socket.io types acks variadically; the contract is enforced by the
		// ClientToServerEvents key and the R returned to the caller.
		const emit = getSocket().emit.bind(getSocket()) as (ev: string, ...args: unknown[]) => void
		if (payload === undefined) emit(event, settle)
		else emit(event, payload, settle)
	})
}
