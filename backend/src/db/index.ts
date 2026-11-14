import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'

/**
 * SQLite, opened once for the whole process.
 *
 * A file on disk is enough here: one backend instance, a handful of writes per
 * second. If this is ever scaled out, this module is the single seam to swap —
 * every query in the app goes through `db`.
 */
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '..', '..', 'data', 'app.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)

// WAL lets reads continue while a write is in flight, and survives a crash.
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id            TEXT PRIMARY KEY,
		email         TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		display_name  TEXT NOT NULL,
		sprite_id     INTEGER NOT NULL,
		last_x        INTEGER,
		last_y        INTEGER,
		created_at    INTEGER NOT NULL,
		last_seen_at  INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS sessions (
		token_hash   TEXT PRIMARY KEY,
		user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at   INTEGER NOT NULL,
		last_used_at INTEGER NOT NULL,
		expires_at   INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS cards (
		id          TEXT PRIMARY KEY,
		user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		pokedex_id  INTEGER NOT NULL,
		name        TEXT NOT NULL,
		rarity      TEXT NOT NULL,
		obtained_at INTEGER NOT NULL
	);

	CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);
	CREATE INDEX IF NOT EXISTS sessions_by_expiry ON sessions(expires_at);
	CREATE INDEX IF NOT EXISTS cards_by_user ON cards(user_id);
`)

/**
 * Columns added after the first release. SQLite has no `ADD COLUMN IF NOT
 * EXISTS`, so each one is checked against the table's own schema — this runs
 * on every boot and must stay idempotent.
 */
function addColumn(table: string, column: string, definition: string): void {
	const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
	if (existing.some((c) => c.name === column)) return
	db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

// Booster economy: how many packs are waiting, and when the current accrual
// window opened. The default of 1 doubles as the backfill — accounts that
// predate the booster system get the same welcome pack a new trainer does,
// once, when the column is added. New rows pass the value explicitly.
addColumn('users', 'boosters_pending', 'INTEGER NOT NULL DEFAULT 1')
addColumn('users', 'booster_since', `INTEGER NOT NULL DEFAULT 0`)

export { DB_PATH }
