import { randomUUID } from 'crypto'

import { db } from '../db'
import { appearanceForId, parseAppearance, type Appearance } from '../appearance/appearance'
import { crownFor } from '../ranking/crowns'
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
	/** Packs waiting to be opened. */
	boosters_pending: number
	/** Start of the current accrual window; 0 until the first visit. */
	booster_since: number
	/** JSON appearance; empty string until the account is first drawn. */
	appearance: string
	/** 1 for an account that was playing before the beta wipe. */
	beta_tester: number
}

/** What the client is allowed to see. */
export interface PublicUser {
	id: string
	email: string
	displayName: string
	spriteId: number
	lastSeenAt: number
	appearance: Appearance
	/** Carries the blue aura at the barber; see `appearance/appearance.ts`. */
	betaTester: boolean
	/**
	 * The podium crown this account may wear right now, 0 for none.
	 *
	 * Sent with the account rather than left for the barber to work out of the
	 * ranking: the entitlement is a server fact — place one, two or three —
	 * and the client has no business re-deriving the standing to guess it.
	 * See `ranking/crowns.ts`.
	 */
	podiumCrown: number
}

export function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		email: row.email,
		displayName: row.display_name,
		spriteId: row.sprite_id,
		lastSeenAt: row.last_seen_at,
		appearance: appearanceOf(row),
		betaTester: row.beta_tester === 1,
		podiumCrown: crownFor(row.id),
	}
}

/**
 * Whether this account may wear the beta testers' aura.
 *
 * Read by id rather than taken off a row the caller already has: the one
 * caller that matters is the appearance save, which holds a user id and no
 * row, and a cosmetic unlock is not worth a second lookup elsewhere.
 */
export function isBetaTester(userId: string): boolean {
	const row = db.prepare('SELECT beta_tester FROM users WHERE id = ?').get(userId) as
		| { beta_tester: number }
		| undefined
	return row?.beta_tester === 1
}

/**
 * The stored look, or the one generated from the id if never customised.
 *
 * The podium crown is checked here rather than trusted to the column: it is
 * the one reward that can be lost, so a crown that no longer matches this
 * account's place on the ranking is dropped on the way out. The stored value
 * stays — someone who slips to second and climbs back gets the gold one
 * again without a trip to the barber — and every screen that draws a trainer
 * goes through this function, so none of them can show a stale crown.
 */
export function appearanceOf(row: UserRow): Appearance {
	const appearance = row.appearance ? parseAppearance(row.appearance) : appearanceForId(row.id)
	if (appearance.crown !== 0 && appearance.crown !== crownFor(row.id)) appearance.crown = 0
	return appearance
}

export function saveAppearance(userId: string, appearance: Appearance): void {
	db.prepare('UPDATE users SET appearance = ? WHERE id = ?').run(JSON.stringify(appearance), userId)
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
		`INSERT INTO users (id, email, password_hash, display_name, sprite_id, created_at, last_seen_at, boosters_pending, booster_since)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		// A new trainer starts with one pack to open, and the clock already running.
	).run(id, normalizeEmail(email), hashPassword(password), displayName, spriteForId(id), now, now, 1, now)

	return findById(id)!
}

export function updateDisplayName(userId: string, displayName: string): void {
	db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId)
}

export function updatePassword(userId: string, password: string): void {
	db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId)
}

/**
 * Erase the account. Sessions and cards go with it through the ON DELETE
 * CASCADE foreign keys, which is why `PRAGMA foreign_keys` is on.
 */
export function deleteUser(userId: string): void {
	db.prepare('DELETE FROM users WHERE id = ?').run(userId)
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
