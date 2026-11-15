/**
 * Regenerate `src/services/frenchNames.ts` from PokeAPI.
 *
 * Run with `npm run names:fr` from `backend/`. Takes about twenty seconds and
 * is the only thing in this project that needs the network at build time: the
 * point of the generated table is that nothing needs it at runtime.
 *
 *   node scripts/french-names.mjs [lastPokedexId]
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LAST_ID = Number(process.argv[2]) || 898
const CONCURRENCY = 8
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'services', 'frenchNames.ts')

/** One species, retried: 898 requests over a public API will drop a few. */
async function species(id) {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			const data = await response.json()
			const french = data.names.find((n) => n.language.name === 'fr')?.name
			if (!french) throw new Error('no French name')
			return [data.name, french]
		} catch (cause) {
			if (attempt === 2) throw new Error(`#${id}: ${cause.message}`)
			await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
		}
	}
}

const rows = new Array(LAST_ID)
let next = 0
await Promise.all(
	Array.from({ length: CONCURRENCY }, async () => {
		while (next < LAST_ID) {
			const index = next++
			rows[index] = await species(index + 1)
		}
	}),
)

// A name carrying a quote or a backslash would need escaping the generated
// file does not do; none ever has, and failing loudly beats emitting broken TS.
const UNSAFE = ["'", String.fromCharCode(92)]
for (const [slug, french] of rows) {
	const offender = UNSAFE.find((character) => (slug + french).includes(character))
	if (offender) throw new Error(`name needs escaping: ${slug} / ${french}`)
}

const body = rows.map(([slug, french]) => `\t['${slug}', '${french}'],`).join('\n')

writeFileSync(
	OUT,
	`/**
 * French species names, generation 1 to 8.
 *
 * Embedded for the same reason as the type chart: a card's label must be
 * instant and identical on every boot. PokeAPI only serves a localised name
 * through \`/pokemon-species/{id}\`, which would mean one extra round trip per
 * species — and a name quietly falling back to English whenever PokeAPI
 * hiccups, then written into the database and kept there.
 *
 * Regenerate with \`npm run names:fr\` when a generation is added. Index + 1 is
 * the Pokedex id, so the order of this list is load-bearing.
 */

/** \`[english slug, french name]\`, in Pokedex order from #1. */
const NAMES: readonly (readonly [slug: string, french: string])[] = [
${body}
]

/** How many species this table covers. */
export const LAST_NAMED_ID = NAMES.length

/** Built once: PokeAPI hands evolutions and pre-evolutions back as slugs. */
const ID_BY_SLUG = new Map(NAMES.map(([slug], index) => [slug, index + 1]))

/**
 * The French name of a species, or \`fallback\` when it is outside the table.
 *
 * A species the table does not know — a newer generation, an alternate form —
 * keeps whatever name the caller already had rather than losing it.
 */
export function frenchName(pokedexId: number, fallback = ''): string {
	return NAMES[pokedexId - 1]?.[1] ?? fallback
}

/** The same, from the English slug PokeAPI uses inside its own payloads. */
export function frenchNameFromSlug(slug: string, fallback = slug): string {
	const id = ID_BY_SLUG.get(slug.toLowerCase())
	return id === undefined ? fallback : frenchName(id, fallback)
}

/** Every \`[pokedexId, frenchName]\` pair, for the database backfill. */
export function frenchNameEntries(): [pokedexId: number, french: string][] {
	return NAMES.map(([, french], index) => [index + 1, french])
}
`,
	'utf8',
)

console.log(`${OUT}: ${LAST_ID} names`)
