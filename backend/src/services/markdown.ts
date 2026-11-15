import type { Pokemon, Resistance } from '../controllers/PokemonController'

/**
 * Pokemon → Markdown, written for retrieval rather than for reading.
 *
 * These files are what the VirtualBrain brain indexes, so the document is
 * optimised for a vector search: the name is repeated in prose instead of
 * living only in a heading, numbers are restated as sentences ("fast but
 * fragile"), and the matchup section spells out which types hurt it. A bare
 * stat table would retrieve badly — "what beats Onix" has to match *text*.
 */

const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

/** "a Fire-type" / "an Electric-type" — the files are prose, so this shows. */
const article = (word: string): string => ('aeiou'.includes(word.charAt(0).toLowerCase()) ? 'an' : 'a')

/** "fast, fragile" reads like a list; "fast and fragile" reads like a sentence. */
function sentenceList(parts: string[]): string {
	if (parts.length <= 1) return parts[0] ?? ''
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * The English name, for the brain to retrieve on either language.
 *
 * `slug` is PokeAPI's identifier, so it is what an English question matches:
 * "mr-mime" → "Mr Mime". The French name comes from `pokemon.name`, which the
 * service already localises.
 */
const englishName = (slug: string): string => slug.split('-').map(capitalise).join(' ')

/** `025-pikachu.md` — zero-padded so a plain file listing is dex-ordered. */
export function markdownFilename(pokemon: Pick<Pokemon, 'pokedexId' | 'slug'>): string {
	return `${String(pokemon.pokedexId).padStart(3, '0')}-${pokemon.slug}.md`
}

function statLines(pokemon: Pokemon): string {
	const { stats } = pokemon
	const total =
		stats.HP + stats.attack + stats.defense + stats.special_attack + stats.special_defense + stats.speed

	return [
		'| Stat | Value |',
		'| --- | --- |',
		`| HP | ${stats.HP} |`,
		`| Attack | ${stats.attack} |`,
		`| Defense | ${stats.defense} |`,
		`| Special Attack | ${stats.special_attack} |`,
		`| Special Defense | ${stats.special_defense} |`,
		`| Speed | ${stats.speed} |`,
		`| **Total** | **${total}** |`,
	].join('\n')
}

/** A sentence a language model can actually reason with, not just numbers. */
function profile(pokemon: Pokemon): string {
	const { stats } = pokemon
	const name = pokemon.name
	const traits: string[] = []

	if (stats.speed >= 100) traits.push('very fast')
	else if (stats.speed >= 80) traits.push('fast')
	else if (stats.speed <= 40) traits.push('slow')

	if (stats.attack >= 110) traits.push('a heavy physical attacker')
	else if (stats.special_attack >= 110) traits.push('a heavy special attacker')
	else if (stats.attack >= 85) traits.push('a solid physical attacker')
	else if (stats.special_attack >= 85) traits.push('a solid special attacker')

	if (stats.defense >= 110 || stats.special_defense >= 110) traits.push('hard to break through')
	else if (stats.HP <= 45 && stats.defense <= 50) traits.push('fragile')

	const summary = traits.length > 0 ? `${name} is ${sentenceList(traits)}.` : `${name} is an all-rounder.`

	return [
		summary,
		`It has ${stats.HP} HP, ${stats.attack} Attack, ${stats.defense} Defense, ${stats.special_attack} Special Attack, ${stats.special_defense} Special Defense and ${stats.speed} Speed.`,
	].join(' ')
}

/** Group the 18 attacking types by how much damage they deal to this Pokemon. */
function matchups(resistances: Resistance[]): string {
	const by = (predicate: (r: Resistance) => boolean) =>
		resistances
			.filter(predicate)
			.map((r) => capitalise(r.name))
			.join(', ')

	const immune = by((r) => r.damage_multiplier === 0)
	const quarter = by((r) => r.damage_multiplier === 0.25)
	const half = by((r) => r.damage_multiplier === 0.5)
	const double = by((r) => r.damage_multiplier === 2)
	const quadruple = by((r) => r.damage_multiplier === 4)

	const lines: string[] = []
	if (quadruple) lines.push(`- Takes **4x** damage from: ${quadruple}`)
	if (double) lines.push(`- Takes **2x** damage from: ${double}`)
	if (half) lines.push(`- Takes **half** damage from: ${half}`)
	if (quarter) lines.push(`- Takes **a quarter** of the damage from: ${quarter}`)
	if (immune) lines.push(`- Is **immune** to: ${immune}`)

	return lines.length > 0 ? lines.join('\n') : '- No notable weaknesses or resistances.'
}

function evolutions(pokemon: Pokemon): string {
	const name = pokemon.name
	const parts: string[] = []

	if (pokemon.apiPreEvolution && pokemon.apiPreEvolution !== 'none') {
		parts.push(`${name} evolves from ${pokemon.apiPreEvolution}.`)
	}
	if (pokemon.apiEvolutions.length > 0) {
		const into = pokemon.apiEvolutions.map((e) => `${e.name} (#${e.pokedexId})`).join(' and ')
		parts.push(`${name} evolves into ${into}.`)
	}
	if (parts.length === 0) parts.push(`${name} does not evolve.`)

	return parts.join(' ')
}

export function pokemonToMarkdown(pokemon: Pokemon): string {
	const name = pokemon.name
	const english = englishName(pokemon.slug)
	const types = pokemon.apiTypes.map((t) => capitalise(t.name))
	const typeLabel = types.length > 0 ? types.join('/') : 'Unknown'

	return `# ${name} (${english}, #${pokemon.pokedexId})

${name} — known in English as ${english} — is ${article(typeLabel)} ${typeLabel}-type Pokémon from generation ${pokemon.apiGeneration}.

![${name}](${pokemon.image})

## Types

${types.map((type) => `- ${type}`).join('\n') || '- Unknown'}

## Base stats

${statLines(pokemon)}

## Battle profile

${profile(pokemon)}

## Type matchups

How much damage ${name} takes from each attacking type:

${matchups(pokemon.apiResistances)}

## Evolutions

${evolutions(pokemon)}

---

Pokedex number: ${pokemon.pokedexId}. Nom français : ${name}. English name: ${english}. Types: ${typeLabel}. Generation: ${pokemon.apiGeneration}.
`
}
