import { type Request, type Response, Router } from 'express'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { markdownFilename, pokemonToMarkdown } from '../services/markdown'
import { fetchPokemon } from '../services/pokeapi'

const ContentController = Router()

/** Generations 1 to 8, as the brief asks. */
const LAST_POKEDEX_ID = 898

/**
 * Where `/contents/all` writes. The name matches the brain's import config,
 * so changing it means re-importing on VirtualBrain's side.
 */
const EXPORT_DIR = process.env.EXPORT_DIR ?? join(__dirname, '..', '..', 'pokemons-ru')

/**
 * How many Pokemon are fetched at once.
 *
 * Each one costs about five PokeAPI calls (pokemon, its types, species,
 * evolution chain), so 898 of them is roughly 4500 requests. PokeAPI sets no
 * rate limit but explicitly asks clients not to hammer it; eight in flight
 * keeps the export to a few minutes without being rude.
 */
const CONCURRENCY = 8

/** Run `task` over `items`, never more than `limit` at a time. */
async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let next = 0

	const worker = async () => {
		while (next < items.length) {
			const index = next++
			results[index] = await task(items[index])
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
	return results
}

interface ExportOutcome {
	pokedexId: number
	status: 'written' | 'skipped' | 'failed'
	file?: string
	error?: string
}

/**
 * Write one Pokemon's Markdown into the export folder.
 *
 * Existing files are left alone unless `force` is set, which makes the export
 * resumable: a run interrupted at #500 picks up where it stopped instead of
 * re-fetching everything.
 */
async function exportOne(pokedexId: number, force: boolean): Promise<ExportOutcome> {
	try {
		// The filename needs the slug, which only the API can give us, so a skip
		// still costs one lookup — cheap next to the four it avoids.
		const pokemon = await fetchPokemon(String(pokedexId))
		const file = markdownFilename(pokemon)
		const path = join(EXPORT_DIR, file)

		if (!force && existsSync(path)) return { pokedexId, status: 'skipped', file }

		writeFileSync(path, pokemonToMarkdown(pokemon), 'utf8')
		return { pokedexId, status: 'written', file }
	} catch (cause) {
		return { pokedexId, status: 'failed', error: cause instanceof Error ? cause.message : 'unknown error' }
	}
}

/**
 * Export every Pokemon as Markdown into a local folder, ready to be imported
 * as a VirtualBrain brain.
 *
 * @route GET /contents/all
 * @group Contents
 * @param {number} from.query - First pokedex id, defaults to 1
 * @param {number} to.query - Last pokedex id, defaults to 898
 * @param {boolean} force.query - Rewrite files that already exist
 */
ContentController.get('/all', async (req: Request, res: Response) => {
	const from = Math.max(1, Number(req.query.from) || 1)
	const to = Math.min(LAST_POKEDEX_ID, Number(req.query.to) || LAST_POKEDEX_ID)
	const force = req.query.force === 'true'

	if (from > to) {
		return res.status(400).json({ error: { code: 'INVALID_RANGE', message: '`from` must not exceed `to`' } })
	}

	mkdirSync(EXPORT_DIR, { recursive: true })

	const ids = Array.from({ length: to - from + 1 }, (_, index) => from + index)
	const started = Date.now()
	console.log(`[contents] exporting ${ids.length} pokemon to ${EXPORT_DIR}`)

	const outcomes = await mapWithConcurrency(ids, CONCURRENCY, (id) => exportOne(id, force))

	const written = outcomes.filter((o) => o.status === 'written').length
	const skipped = outcomes.filter((o) => o.status === 'skipped').length
	const failed = outcomes.filter((o) => o.status === 'failed')
	const seconds = Math.round((Date.now() - started) / 1000)

	console.log(`[contents] done in ${seconds}s — ${written} written, ${skipped} skipped, ${failed.length} failed`)

	return res.status(200).json({
		directory: EXPORT_DIR,
		total: ids.length,
		written,
		skipped,
		seconds,
		// Listed rather than counted: a handful of ids always 404 on PokeAPI and
		// it should be obvious which, not a number to go hunting for.
		failed: failed.map(({ pokedexId, error }) => ({ pokedexId, error })),
	})
})

/**
 * Return a single Pokemon as a downloadable Markdown file.
 *
 * @route GET /contents/:pokemonId
 * @group Contents
 * @param {string} pokemonId.path.required - Pokemon ID
 */
ContentController.get('/:pokemonId', async (req: Request, res: Response) => {
	const { pokemonId } = req.params

	try {
		const pokemon = await fetchPokemon(pokemonId)
		const markdown = pokemonToMarkdown(pokemon)

		res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
		res.setHeader('Content-Disposition', `attachment; filename="${markdownFilename(pokemon)}"`)
		return res.status(200).send(markdown)
	} catch {
		return res
			.status(404)
			.json({ error: { code: 'POKEMON_NOT_FOUND', message: `No pokemon for id "${pokemonId}"` } })
	}
})

export { ContentController, EXPORT_DIR }
