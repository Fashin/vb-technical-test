/**
 * End of the beta: wipe what the players generated, keep the players.
 *
 * The beta ran with recycling a hundred times too cheap (ten shards a pack
 * instead of a thousand — see `src/boosters/recycle.ts`), so the collections
 * it produced say nothing about the balanced game. They go. The accounts stay:
 * nobody should have to sign up twice, and the testers get something for the
 * evening they spent breaking it — the "Bêta-testeur" achievement and the
 * crown it unlocks at the barber.
 *
 * What is erased, per account:
 *   cards, teams and their members, battles, duels, trades, arena victories,
 *   lucky boosters, leftover shards, the selected team, and the badge pin and
 *   crown on the saved appearance (both are earned, and one of the two is
 *   being re-earned by this very script).
 *
 * What is kept: the account itself — email, password, pseudo, sprite, the
 * look chosen at the barber, and where it logged off.
 *
 * Usage, from `backend/`:
 *
 *   node scripts/reset-beta.mjs --dry-run    # count everything, change nothing
 *   node scripts/reset-beta.mjs              # ask, then do it
 *   node scripts/reset-beta.mjs --yes        # no question (for a deploy script)
 *
 * `DB_PATH` is honoured exactly as the app honours it — including out of
 * `backend/.env`, which is where it actually lives in production — so the same
 * command works on the server. **Stop the backend first**: it holds the SQLite
 * file open, and a player opening a booster halfway through the wipe would be
 * writing cards into a collection that is being deleted.
 */
import Database from 'better-sqlite3'
import { config as loadEnv } from 'dotenv'
import { copyFileSync, existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * `.env`, read from the backend root rather than from the current directory.
 *
 * The app gets this for free — `src/config.ts` imports `dotenv/config`, and
 * systemd starts it with `backend/` as its working directory. A script run by
 * hand has no such guarantee, and the first version of this one skipped `.env`
 * altogether: on the server it went looking for `backend/data/app.db`, found
 * nothing, and reported an empty database while the real one sat untouched at
 * the `DB_PATH` in `.env`. An existing variable in the environment still wins,
 * which is how the dry run can be pointed at a copy.
 */
loadEnv({ path: join(HERE, '..', '.env'), quiet: true })

const DB_PATH = process.env.DB_PATH ?? join(HERE, '..', 'data', 'app.db')
const DB_SOURCE = process.env.DB_PATH ? 'DB_PATH' : 'defaut'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run') || args.has('-n')
const assumeYes = args.has('--yes') || args.has('-y')

/** Mirrored from `src/appearance/appearance.ts`. */
const CROWN_HAT = 3

/**
 * Tables emptied wholesale.
 *
 * Every row in each of them belongs to a player: there is no seeded or
 * reference data in the schema — the masters, the camps and the Pokemon names
 * all live in TypeScript. So it is a list of table names rather than a list of
 * deletes with conditions.
 *
 * `team_members` is listed before `teams` and `cards` only for the dry run's
 * sake; the real delete order does not matter, since the whole thing runs with
 * the foreign keys following their cascades.
 */
const WIPED = [
	'team_members',
	'teams',
	'cards',
	'battles',
	'duels',
	'trades',
	'master_victories',
	'lucky_boosters',
]

if (!existsSync(DB_PATH)) {
	console.error(`Pas de base à ${DB_PATH} (${DB_SOURCE}).`)
	console.error('Vérifie DB_PATH dans backend/.env, ou passe-le explicitement :')
	console.error('  DB_PATH=/chemin/vers/app.db node scripts/reset-beta.mjs --dry-run')
	process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

/**
 * The flag the achievement reads.
 *
 * Added here as well as in `src/db/index.ts` so the script can be run against
 * a database the new backend has never booted against — which is the normal
 * case during a deploy, where the wipe happens before the restart.
 */
const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
if (!columns.includes('beta_tester')) {
	if (dryRun) {
		console.log('La colonne users.beta_tester serait ajoutée.')
	} else {
		db.exec('ALTER TABLE users ADD COLUMN beta_tester INTEGER NOT NULL DEFAULT 0')
		console.log('Colonne users.beta_tester ajoutée.')
	}
}


const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
const users = count('users')

console.log(`Base : ${DB_PATH} (${DB_SOURCE})`)
console.log(`Comptes conservés : ${users}`)
const verb = dryRun ? 'à supprimer' : 'supprimée(s)'
for (const table of WIPED) console.log(`  ${table.padEnd(18)} ${count(table)} ligne(s) ${verb}`)

if (dryRun) {
	console.log('\n--dry-run : rien n’a été écrit.')
	db.close()
	process.exit(0)
}

if (users === 0) {
	console.log('\nAucun compte : rien à faire.')
	db.close()
	process.exit(0)
}

if (!assumeYes) {
	const rl = createInterface({ input: process.stdin, output: process.stdout })
	const answer = await rl.question(
		`\nSupprimer toute la progression de ces ${users} compte(s) et leur donner le succès ` +
			'« Bêta-testeur » ? Tape "reset" pour confirmer : ',
	)
	rl.close()
	if (answer.trim() !== 'reset') {
		console.log('Annulé — rien n’a été écrit.')
		db.close()
		process.exit(1)
	}
}

/**
 * A copy of the file before anything is touched.
 *
 * This is the one operation in the project that cannot be undone, and it is
 * run by hand on a live database. A `.backup` next to the original costs a
 * second and makes a mistake recoverable.
 */
const backup = `${DB_PATH}.before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}`
db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
copyFileSync(DB_PATH, backup)
console.log(`Sauvegarde : ${backup}`)

/**
 * The wipe and the reward, in one transaction.
 *
 * Together because they are one event: an account that lost its collection
 * without getting the crown would be the worst of both, and a crash between
 * the two is exactly how that happens.
 */
const wipe = db.transaction(() => {
	for (const table of WIPED) db.prepare(`DELETE FROM ${table}`).run()

	db.prepare(
		`UPDATE users SET
		   shards = 0,
		   boosters_pending = 1,
		   booster_since = ?,
		   active_team_id = NULL,
		   beta_tester = 1`,
	).run(Date.now())

	// The pin and the crown are earned, and the wipe just un-earned every
	// badge. Rather than parse the JSON here, the two fields are rewritten in
	// SQLite's own JSON functions — the rest of the look is left exactly as the
	// player set it. An empty appearance means "never customised" and is left
	// empty, so the generated starting look keeps being used.
	db.prepare(
		`UPDATE users
		 SET appearance = json_set(appearance, '$.pin', 0, '$.hat', CASE
		       WHEN json_extract(appearance, '$.hat') = ? THEN 0
		       ELSE json_extract(appearance, '$.hat')
		     END)
		 WHERE appearance <> '' AND json_valid(appearance)`,
	).run(CROWN_HAT)

	// Sessions survive: a tester who left a tab open stays logged in, and what
	// they see on the next request is an empty collection, which is the point.
})

wipe()

db.exec('VACUUM')
db.close()

console.log(
	`\nFait. ${users} compte(s) remis à zéro, avec un booster de bienvenue, ` +
		'le succès « Bêta-testeur » et la couronne débloquée chez le coiffeur.',
)
