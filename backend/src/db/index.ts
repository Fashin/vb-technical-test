import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'

import { frenchNameEntries } from '../services/frenchNames'

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

	CREATE TABLE IF NOT EXISTS teams (
		id         TEXT PRIMARY KEY,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name       TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS team_members (
		team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
		slot    INTEGER NOT NULL,
		card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
		PRIMARY KEY (team_id, slot),
		UNIQUE (team_id, card_id)
	);

	CREATE TABLE IF NOT EXISTS battles (
		id         TEXT PRIMARY KEY,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		master_id  TEXT NOT NULL,
		/** VirtualBrain session, so the chatbot remembers the earlier rounds. */
		session_id TEXT,
		state      TEXT NOT NULL,
		status     TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS duels (
		id        TEXT PRIMARY KEY,
		winner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		loser_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		fought_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS trades (
		id        TEXT PRIMARY KEY,
		trade_id  TEXT NOT NULL,
		giver_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		taker_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		card_id   TEXT NOT NULL,
		traded_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS master_victories (
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		master_id  TEXT NOT NULL,
		defeated_at INTEGER NOT NULL,
		PRIMARY KEY (user_id, master_id)
	);

	/**
	 * Packs bought with recycled duplicates, grouped by how lucky they are.
	 *
	 * A row per (user, luck) rather than a row per pack: packs of the same luck
	 * are interchangeable, so a counter says everything a list of identical
	 * rows would. The luck column is the bonus in percentage points — see
	 * boosters/recycle.ts.
	 */
	CREATE TABLE IF NOT EXISTS lucky_boosters (
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		luck    INTEGER NOT NULL,
		count   INTEGER NOT NULL,
		PRIMARY KEY (user_id, luck)
	);

	CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);
	CREATE INDEX IF NOT EXISTS sessions_by_expiry ON sessions(expires_at);
	CREATE INDEX IF NOT EXISTS cards_by_user ON cards(user_id);
	CREATE INDEX IF NOT EXISTS teams_by_user ON teams(user_id);
	CREATE INDEX IF NOT EXISTS battles_by_user ON battles(user_id, status);
	CREATE INDEX IF NOT EXISTS duels_by_winner ON duels(winner_id);
	CREATE INDEX IF NOT EXISTS trades_by_giver ON trades(giver_id);
	CREATE INDEX IF NOT EXISTS trades_by_taker ON trades(taker_id);
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

// Trainer look, stored as JSON so a new feature (a jacket, a bag) does not
// need a migration. Empty means "never customised": the account's generated
// starting look is used instead.
addColumn('users', 'appearance', `TEXT NOT NULL DEFAULT ''`)

// Experience, and so the level, of one card. The default is the experience of
// the starting level rather than 0: cards drawn before this feature would read
// as level 1 and be worthless against masters that now have levels of their own.
addColumn('cards', 'xp', 'INTEGER NOT NULL DEFAULT 300')

// Damage carried between fights, as a share of the card's maximum (0 is
// untouched, 1 is fainted), and the moment its treatment at the healing centre
// finishes — NULL when the card is not there. A share rather than a number of
// hit points: the maximum moves with the level, an absolute would not.
addColumn('cards', 'hp_lost', 'REAL NOT NULL DEFAULT 0')
addColumn('cards', 'healed_at', 'INTEGER')

// Leftover recycling shards: what a transformation produced but could not
// turn into a whole pack. Kept rather than dropped, so nine duplicates are
// never worth nothing — they wait for the tenth. See `boosters/recycle.ts`.
addColumn('users', 'shards', 'INTEGER NOT NULL DEFAULT 0')

// The team taken into the arena. Nullable: a fresh account has none, and
// deleting the selected team puts it back to NULL rather than dangling.
addColumn('users', 'active_team_id', 'TEXT')

/**
 * Cards drawn before the names were localised still carry "gengar".
 *
 * A card's name is denormalised onto its row — the collection, the teams and
 * the battle log all read it from there — so switching the display language
 * means rewriting those rows once. `name <> ?` makes every later boot a pure
 * read: the statement matches nothing and writes nothing.
 *
 * Deliberately not restricted to the booster pool: a card can also arrive by
 * trade, and a widened pool would otherwise leave old rows behind.
 */
function localiseCardNames(): void {
	const rename = db.prepare('UPDATE cards SET name = ? WHERE pokedex_id = ? AND name <> ?')
	db.transaction(() => {
		for (const [pokedexId, french] of frenchNameEntries()) rename.run(french, pokedexId, french)
	})()
}

localiseCardNames()

export { DB_PATH }
