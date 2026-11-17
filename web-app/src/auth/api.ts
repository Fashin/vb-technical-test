/**
 * Auth transport.
 *
 * The session token lives in `localStorage` and is sent as a bearer token,
 * both on these REST calls and in the socket.io handshake. That makes it
 * readable by any script running on the page — the trade-off accepted here for
 * a single token that works over HTTP and WebSocket alike. Moving to an
 * httpOnly cookie means changing this file and `realtime/socket.ts`, nothing else.
 */
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

const TOKEN_KEY = 'vb.session'

import type { Appearance } from '../trainer/appearance'

export interface PublicUser {
	id: string
	email: string
	displayName: string
	spriteId: number
	lastSeenAt: number
	appearance: Appearance
	/** Played before the beta wipe; unlocks the crown at the barber. */
	betaTester: boolean
}

export interface ApiError {
	code: string
	message: string
}

export class AuthError extends Error {
	constructor(public readonly code: string, message: string) {
		super(message)
		this.name = 'AuthError'
	}
}

/** Private browsing and blocked site data make storage throw; never crash on it. */
export function readToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY)
	} catch {
		return null
	}
}

export function writeToken(token: string | null): void {
	try {
		if (token) localStorage.setItem(TOKEN_KEY, token)
		else localStorage.removeItem(TOKEN_KEY)
	} catch {
		/* a session that lasts for this tab only is better than a crash */
	}
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = readToken()

	// `fetch` rejects with a bare TypeError when the request never reaches the
	// server at all — offline, server down, blocked by a proxy or by mixed
	// content. Translating it into an `AuthError` means every caller has one
	// error shape to handle, and the user reads a cause instead of
	// "Failed to fetch".
	let response: Response
	try {
		response = await fetch(`${API_URL}${path}`, {
			...init,
			headers: {
				'Content-Type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...init.headers,
			},
		})
	} catch {
		throw new AuthError('NETWORK', 'Serveur injoignable')
	}

	if (response.status === 204) return undefined as T
	const body = await response.json().catch(() => null)

	if (!response.ok) {
		const error = (body as { error?: ApiError } | null)?.error
		throw new AuthError(error?.code ?? 'NETWORK', error?.message ?? 'Something went wrong')
	}
	return body as T
}

interface Session {
	user: PublicUser
	token: string
}

export function register(email: string, password: string, displayName: string): Promise<Session> {
	return send<Session>('/auth/register', {
		method: 'POST',
		body: JSON.stringify({ email, password, displayName }),
	})
}

export function login(email: string, password: string): Promise<Session> {
	return send<Session>('/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, password }),
	})
}

/** Auto-login probe. Resolves with the user, or throws on an invalid token. */
export function me(): Promise<{ user: PublicUser }> {
	return send<{ user: PublicUser }>('/auth/me')
}

/** Save the trainer's look; the server clamps it to the known palettes. */
export function saveAppearance(appearance: Appearance): Promise<{ appearance: Appearance }> {
	return send<{ appearance: Appearance }>('/auth/appearance', {
		method: 'PUT',
		body: JSON.stringify({ appearance }),
	})
}

/** Rename the trainer. Cosmetic, so no password is required. */
export function changeDisplayName(displayName: string): Promise<{ user: PublicUser }> {
	return send<{ user: PublicUser }>('/auth/display-name', {
		method: 'PUT',
		body: JSON.stringify({ displayName }),
	})
}

/**
 * Change the password. The server revokes every existing session and returns
 * a fresh token, so the tab doing the change stays signed in while the others
 * are logged out.
 */
export function changePassword(currentPassword: string, newPassword: string): Promise<{ token: string }> {
	return send<{ token: string }>('/auth/password', {
		method: 'PUT',
		body: JSON.stringify({ currentPassword, newPassword }),
	})
}

/** Delete the account for good. Guarded by the password, and irreversible. */
export function deleteAccount(password: string): Promise<void> {
	return send<void>('/auth/me', {
		method: 'DELETE',
		body: JSON.stringify({ password }),
	})
}

export function logout(): Promise<void> {
	return send<void>('/auth/logout', { method: 'POST' })
}
