import { createHash, randomBytes } from 'crypto'

import { db } from '../db'
import { findById, type UserRow } from './users'

/**
 * Opaque bearer sessions.
 *
 * The raw token is returned to the client exactly once and never stored: the
 * table only holds its SHA-256, so a leaked database cannot be replayed as a
 * login. The window is 30 days and *sliding* — every accepted request pushes
 * the expiry back, which is what lets a returning player skip the login form.
 */
const TOKEN_BYTES = 32
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}

export function issueSession(userId: string): string {
	const token = randomBytes(TOKEN_BYTES).toString('hex')
	const now = Date.now()

	db.prepare(
		`INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at)
		 VALUES (?, ?, ?, ?, ?)`,
	).run(hashToken(token), userId, now, now, now + SESSION_TTL_MS)

	return token
}

/**
 * Resolve a token to its user, sliding the expiry. Returns null for unknown,
 * expired or orphaned tokens — the caller cannot tell which, on purpose.
 */
export function verifySession(token: string | null | undefined): UserRow | null {
	if (!token) return null

	const tokenHash = hashToken(token)
	const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash) as
		| { user_id: string; expires_at: number }
		| undefined
	if (!row) return null

	const now = Date.now()
	if (row.expires_at <= now) {
		db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
		return null
	}

	db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?').run(
		now,
		now + SESSION_TTL_MS,
		tokenHash,
	)

	return findById(row.user_id) ?? null
}

export function revokeSession(token: string): void {
	db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

export function purgeExpiredSessions(): number {
	return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()).changes
}

/** Swept at boot, then hourly — expired rows are dead weight, not a leak. */
export function startSessionReaper(): NodeJS.Timeout {
	purgeExpiredSessions()
	const timer = setInterval(purgeExpiredSessions, 60 * 60 * 1000)
	timer.unref()
	return timer
}
