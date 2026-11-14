import { randomUUID } from 'crypto'

import { db } from '../db'
import { hashPassword } from './passwords'

/** Row as stored. `password_hash` never leaves this module's callers. */
export interface UserRow {
	id: string
	email: string
	password_hash: string
	display_name: string
	sprite_id: number
	last_x: number | null
	last_y: number | null
	created_at: number
	last_seen_at: number
}

/** What the client is allowed to see. */
export interface PublicUser {
	id: string
	email: string
	displayName: string
	spriteId: number
	lastSeenAt: number
}

export function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		email: row.email,
		displayName: row.display_name,
		spriteId: row.sprite_id,
		lastSeenAt: row.last_seen_at,
	}
}

/** Emails are compared lowercased, so `A@b.c` and `a@b.c` are one account. */
export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase()
}

/**
 * Avatar picked from the first generation, derived from the user id so a
 * given account always walks around as the same Pokemon.
 */
const STARTERS = [25, 1, 4, 7, 133, 143, 39, 52, 54, 58, 77, 95, 104, 113, 131]

function spriteForId(id: string): number {
	let hash = 0
	for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	return STARTERS[hash % STARTERS.length]
}

export function findByEmail(email: string): UserRow | undefined {
	return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as UserRow | undefined
}

export function findById(id: string): UserRow | undefined {
	return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

/** Throws if the email is taken — the UNIQUE index is the real guard. */
export function createUser(email: string, password: string, displayName: string): UserRow {
	const now = Date.now()
	const id = randomUUID()

	db.prepare(
		`INSERT INTO users (id, email, password_hash, display_name, sprite_id, created_at, last_seen_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
	).run(id, normalizeEmail(email), hashPassword(password), displayName, spriteForId(id), now, now)

	return findById(id)!
}

export function touchLastSeen(userId: string): void {
	db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), userId)
}

/** Where the player logged off, so the next session resumes there. */
export function savePosition(userId: string, x: number, y: number): void {
	db.prepare('UPDATE users SET last_x = ?, last_y = ?, last_seen_at = ? WHERE id = ?').run(
		x,
		y,
		Date.now(),
		userId,
	)
}
