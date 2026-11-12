import { io, type Socket } from 'socket.io-client'

import type { ClientToServerEvents, ServerToClientEvents } from './events'

export type ArenaSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const REALTIME_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

let socket: ArenaSocket | null = null

/**
 * Lazily created singleton: socket.io keeps one multiplexed connection for the
 * whole tab, so components share this instance instead of each opening their own.
 * `autoConnect` is off — nothing connects until a player actually enters the lobby.
 */
export function getSocket(): ArenaSocket {
	if (!socket) {
		socket = io(REALTIME_URL, {
			autoConnect: false,
			transports: ['websocket', 'polling'],
		})
	}
	return socket
}

/** Promisified `emit` with ack, so callers can `await` a server answer. */
export function request<R>(event: keyof ClientToServerEvents, payload?: unknown): Promise<R> {
	return new Promise((resolve) => {
		// socket.io types acks variadically; the contract is enforced by the
		// ClientToServerEvents key and the R returned to the caller.
		const emit = getSocket().emit.bind(getSocket()) as (ev: string, ...args: unknown[]) => void
		if (payload === undefined) emit(event, resolve)
		else emit(event, payload, resolve)
	})
}
