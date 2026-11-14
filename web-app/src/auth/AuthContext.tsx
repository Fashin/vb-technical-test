import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import * as api from './api'
import type { PublicUser } from './api'
import type { Appearance } from '../trainer/appearance'

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated'

interface AuthValue {
	status: AuthStatus
	user: PublicUser | null
	login: (email: string, password: string) => Promise<void>
	register: (email: string, password: string, displayName: string) => Promise<void>
	logout: () => Promise<void>
	/** Persist a new trainer look and refresh the cached user. */
	restyle: (appearance: Appearance) => Promise<void>
	/** Rename the trainer and refresh the cached user. */
	rename: (displayName: string) => Promise<void>
	changePassword: (currentPassword: string, newPassword: string) => Promise<void>
	/** Erase the account and drop back to the sign-in screen. */
	deleteAccount: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Session state for the whole app.
 *
 * On mount it replays whatever token is in storage against `/auth/me`. The
 * server slides that token's 30-day window on every use, so anyone who played
 * recently walks straight back into the world with no form to fill in; a token
 * that has gone stale is dropped and the login screen appears.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<AuthStatus>(() => (api.readToken() ? 'checking' : 'anonymous'))
	const [user, setUser] = useState<PublicUser | null>(null)

	useEffect(() => {
		if (!api.readToken()) return

		let cancelled = false
		api
			.me()
			.then(({ user: found }) => {
				if (cancelled) return
				setUser(found)
				setStatus('authenticated')
			})
			.catch(() => {
				if (cancelled) return
				api.writeToken(null)
				setStatus('anonymous')
			})

		return () => {
			cancelled = true
		}
	}, [])

	const adopt = useCallback((session: { user: PublicUser; token: string }) => {
		api.writeToken(session.token)
		setUser(session.user)
		setStatus('authenticated')
	}, [])

	const login = useCallback(
		async (email: string, password: string) => adopt(await api.login(email, password)),
		[adopt],
	)

	const register = useCallback(
		async (email: string, password: string, displayName: string) =>
			adopt(await api.register(email, password, displayName)),
		[adopt],
	)

	const logout = useCallback(async () => {
		// Revoke server-side first; drop the local token either way.
		await api.logout().catch(() => undefined)
		api.writeToken(null)
		setUser(null)
		setStatus('anonymous')
	}, [])

	const restyle = useCallback(async (appearance: Appearance) => {
		const saved = await api.saveAppearance(appearance)
		// Trust the server's clamped version, not the one we sent.
		setUser((current) => (current ? { ...current, appearance: saved.appearance } : current))
	}, [])

	const rename = useCallback(async (displayName: string) => {
		const { user: saved } = await api.changeDisplayName(displayName)
		setUser(saved)
	}, [])

	const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
		const { token } = await api.changePassword(currentPassword, newPassword)
		// The old token was revoked along with the others; adopt the new one or
		// this tab logs itself out.
		api.writeToken(token)
	}, [])

	const deleteAccount = useCallback(async (password: string) => {
		await api.deleteAccount(password)
		api.writeToken(null)
		setUser(null)
		setStatus('anonymous')
	}, [])

	const value = useMemo<AuthValue>(
		() => ({ status, user, login, register, logout, restyle, rename, changePassword, deleteAccount }),
		[status, user, login, register, logout, restyle, rename, changePassword, deleteAccount],
	)

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
	const value = useContext(AuthContext)
	if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
	return value
}
