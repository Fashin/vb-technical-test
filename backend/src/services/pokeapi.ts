import axios from 'axios'
import type { DamageRelation, Evolution, Pokemon, Resistance } from '../controllers/PokemonController'
import { frenchName, frenchNameFromSlug } from './frenchNames'

const POKEAPI_URL = 'https://pokeapi.co/api/v2'

/** No outbound call may hang a request forever. */
const REQUEST_TIMEOUT_MS = 8000

interface NamedResource {
	name: string
	url: string
}

interface ApiPokemon {
	id: number
	name: string
	sprites: {
		front_default: string | null
		other: { 'official-artwork': { front_default: string | null } }
	}
	stats: { base_stat: number, stat: NamedResource }[]
	types: { slot: number, type: NamedResource }[]
	abilities: { ability: NamedResource }[]
	species: NamedResource
}

interface ApiType {
	name: string
	damage_relations: {
		double_damage_from: NamedResource[]
		half_damage_from: NamedResource[]
		no_damage_from: NamedResource[]
	}
	sprites: { 'generation-viii': { 'sword-shield': { name_icon: string | null } } }
}

interface ApiSpecies {
	name: string
	generation: NamedResource
	evolves_from_species: NamedResource | null
	evolution_chain: { url: string }
}

interface ApiChainLink {
	species: NamedResource
	evolves_to: ApiChainLink[]
}

interface ApiEvolutionChain {
	chain: ApiChainLink
}

const ATTACKING_TYPES = [
	'normal', 'fire', 'water', 'electric', 'grass', 'ice',
	'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
	'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
]

const DAMAGE_RELATIONS: Record<number, DamageRelation> = {
	0: 'immune',
	0.25: 'twice_resistant',
	0.5: 'resistant',
	1: 'neutral',
	2: 'vulnerable',
	4: 'twice_vulnerable'
}

/** Extract the trailing id from a PokeAPI resource url (e.g. .../generation/1/) */
const idFromUrl = (url: string): number => Number(url.split('/').filter(Boolean).pop())

const baseStat = (pokemon: ApiPokemon, name: string): number =>
	pokemon.stats.find(s => s.stat.name === name)?.base_stat ?? 0

const computeResistances = (types: ApiType[]): Resistance[] =>
	ATTACKING_TYPES.map(attacker => {
		const damage_multiplier = types.reduce((multiplier, { damage_relations: relations }) => {
			if (relations.no_damage_from.some(t => t.name === attacker)) return 0
			if (relations.double_damage_from.some(t => t.name === attacker)) return multiplier * 2
			if (relations.half_damage_from.some(t => t.name === attacker)) return multiplier * 0.5
			return multiplier
		}, 1)

		return { name: attacker, damage_multiplier, damage_relation: DAMAGE_RELATIONS[damage_multiplier] }
	})

const findChainLink = (link: ApiChainLink, speciesName: string): ApiChainLink | undefined =>
	link.species.name === speciesName
		? link
		: link.evolves_to.map(child => findChainLink(child, speciesName)).find(Boolean)

/**
 * Fetch a pokemon from PokeAPI and adapt it to the legacy pokebuildapi `Pokemon` shape
 */
export async function fetchPokemon(id: string): Promise<Pokemon> {
	// The id reaches us from a URL, so it is encoded before being put into
	// another one: nothing a caller types can steer the outbound request.
	const { data: pokemon } = await axios.get<ApiPokemon>(
		`${POKEAPI_URL}/pokemon/${encodeURIComponent(id)}`,
		{ timeout: REQUEST_TIMEOUT_MS },
	)

	const [types, { data: species }] = await Promise.all([
		Promise.all(
			[...pokemon.types]
				.sort((a, b) => a.slot - b.slot)
				.map(({ type }) => axios.get<ApiType>(type.url).then(r => r.data))
		),
		axios.get<ApiSpecies>(pokemon.species.url)
	])

	const { data: evolutionChain } = await axios.get<ApiEvolutionChain>(species.evolution_chain.url)

	const apiEvolutions: Evolution[] = (findChainLink(evolutionChain.chain, species.name)?.evolves_to ?? [])
		.map(({ species: evolution }) => {
			const pokedexId = idFromUrl(evolution.url)
			return { name: frenchName(pokedexId, evolution.name), pokedexId }
		})

	const apiResistances = computeResistances(types)
	const firstAbility = pokemon.abilities[0]?.ability

	return {
		id: pokemon.id,
		pokedexId: pokemon.id,
		// Display name in French, `slug` left as PokeAPI's English identifier:
		// the slug is what builds filenames and what the API is queried with,
		// so it must not become a translation.
		name: frenchName(pokemon.id, pokemon.name),
		image: pokemon.sprites.other['official-artwork'].front_default ?? '',
		sprite: pokemon.sprites.front_default ?? '',
		slug: pokemon.name,
		stats: {
			HP: baseStat(pokemon, 'hp'),
			attack: baseStat(pokemon, 'attack'),
			defense: baseStat(pokemon, 'defense'),
			special_attack: baseStat(pokemon, 'special-attack'),
			special_defense: baseStat(pokemon, 'special-defense'),
			speed: baseStat(pokemon, 'speed')
		},
		apiTypes: types.map(type => ({
			name: type.name,
			image: type.sprites['generation-viii']['sword-shield'].name_icon ?? ''
		})),
		apiGeneration: idFromUrl(species.generation.url),
		apiResistances,
		// PokeAPI has no equivalent: best effort with the first ability
		resistanceModifyingAbilitiesForApi: { name: firstAbility?.name ?? '', slug: firstAbility?.name ?? '' },
		apiEvolutions,
		// A chain link carries no id, only a slug — hence the slug lookup.
		apiPreEvolution: species.evolves_from_species
			? frenchNameFromSlug(species.evolves_from_species.name)
			: 'none',
		// PokeAPI does not compute ability effects on resistances
		apiResistancesWithAbilities: apiResistances
	}
}


/**
 * Just the display name of a pokemon, cached for the process' lifetime.
 *
 * `fetchPokemon` above costs five HTTP round trips (types, species, evolution
 * chain); a booster only needs a name, and the artwork URL is derived from the
 * id. If PokeAPI is unreachable the card still opens, labelled by its dex
 * number — a third party being down must not cost a player their pack.
 */
const nameCache = new Map<number, string>()

export async function fetchCardFace(pokedexId: number): Promise<string> {
	// Generations 1 to 8 are in the table, so the common case costs nothing and
	// cannot fail: a pack opened while PokeAPI is down still shows real names.
	const local = frenchName(pokedexId)
	if (local) return local

	const cached = nameCache.get(pokedexId)
	if (cached) return cached

	try {
		const { data } = await axios.get<{ name: string }>(`${POKEAPI_URL}/pokemon/${pokedexId}`, {
			timeout: 4000,
		})
		const name = data.name
		nameCache.set(pokedexId, name)
		return name
	} catch {
		return `#${String(pokedexId).padStart(3, '0')}`
	}
}


/**
 * The slice of a Pokemon a battle needs: name, types and base stats.
 *
 * One HTTP call, cached for the process' lifetime. `fetchPokemon` above costs
 * five round trips because it resolves type matchups and evolution chains; a
 * fighter needs none of that, and a battle turn cannot wait for it.
 */
export interface Fighter {
	pokedexId: number
	name: string
	types: string[]
	stats: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number }
}

const fighterCache = new Map<number, Fighter>()

export async function fetchFighter(pokedexId: number): Promise<Fighter> {
	const cached = fighterCache.get(pokedexId)
	if (cached) return cached

	const { data } = await axios.get<ApiPokemon>(`${POKEAPI_URL}/pokemon/${pokedexId}`, { timeout: 6000 })
	const stat = (name: string) => data.stats.find((s) => s.stat.name === name)?.base_stat ?? 50

	const fighter: Fighter = {
		pokedexId: data.id,
		name: frenchName(data.id, data.name),
		types: [...data.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
		stats: {
			hp: stat('hp'),
			attack: stat('attack'),
			defense: stat('defense'),
			specialAttack: stat('special-attack'),
			specialDefense: stat('special-defense'),
			speed: stat('speed'),
		},
	}
	fighterCache.set(pokedexId, fighter)
	return fighter
}
