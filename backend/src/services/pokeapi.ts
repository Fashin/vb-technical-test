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
	moves: {
		move: NamedResource
		version_group_details: { level_learned_at: number, move_learn_method: NamedResource }[]
	}[]
}

interface ApiMove {
	name: string
	power: number | null
	type: NamedResource
	damage_class: NamedResource
	names: { name: string, language: NamedResource }[]
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


/**
 * A Pokemon's real attacks, as the engine needs them.
 *
 * Mirrors `battle/damage.ts`'s `Move`, declared here rather than imported so
 * this module keeps knowing nothing about the battle code — it is the adapter
 * in front of PokeAPI, and the engine reads its output.
 */
export interface MoveSpec {
	/** French name when PokeAPI has one, its English slug otherwise. */
	name: string
	type: string
	category: 'physical' | 'special'
	power: number
}

/** How many attacks a fighter walks in with, as in the games. */
const MOVESET_SIZE = 4

/**
 * How many of a species' moves are looked up before the four are chosen.
 *
 * A Pokemon knows dozens; each one is its own HTTP call, so the candidates are
 * capped. The ones kept are those learnt last — the latest moves a Pokemon of
 * this level has reached are the ones it is known for.
 */
const MOVE_CANDIDATES = 14

/** Power the engine accepts, matching `sanitizeMove`'s own clamp. */
const MIN_POWER = 10
const MAX_POWER = 120

/** Per-move cache, keyed by its url: moves are shared, species are not. */
const moveCache = new Map<string, MoveSpec | null>()
/** What a species can learn and when, cached for the process' lifetime. */
const learnsetCache = new Map<number, Learnable[]>()
/** The four attacks chosen for a species at a level — the level is part of the key. */
const movesetCache = new Map<string, MoveSpec[]>()

/** One move a species learns by levelling, and the level it learns it at. */
interface Learnable {
	url: string
	level: number
}

/** One move, or null when it deals no damage (status moves have no power). */
async function fetchMove(url: string): Promise<MoveSpec | null> {
	const cached = moveCache.get(url)
	if (cached !== undefined) return cached

	let spec: MoveSpec | null = null
	try {
		const { data } = await axios.get<ApiMove>(url, { timeout: REQUEST_TIMEOUT_MS })
		const category = data.damage_class.name
		// Status moves are not attacks: the engine only knows how to hit.
		if (data.power !== null && data.power > 0 && (category === 'physical' || category === 'special')) {
			spec = {
				name: data.names.find((entry) => entry.language.name === 'fr')?.name ?? data.name,
				type: data.type.name,
				category,
				// Clamped like a scripted move: a one-hit KO move must not turn a
				// sparring session into a coin flip.
				power: Math.min(MAX_POWER, Math.max(MIN_POWER, data.power)),
			}
		}
	} catch {
		// Left null, and not cached: a timeout is not an answer about this move.
		return null
	}

	moveCache.set(url, spec)
	return spec
}

/**
 * Everything a species can learn, with the level it learns it at.
 *
 * One call per species, cached: the levels are what lets a fighter be given
 * the moves it has actually reached rather than its final arsenal.
 *
 * Only moves learnt by levelling are kept. A machine, an egg or a tutor move
 * carries no level at all, so there is no honest way to say whether this
 * Pokemon has it — and filing them at level 1 was tried first: a level 5
 * Magicarpe came out of it knowing Hydrocanon, which is exactly the kind of
 * thing the filter exists to stop. A species with nothing levelled yet simply
 * has no moveset, and the engine improvises as it did before.
 */
async function fetchLearnset(pokedexId: number): Promise<Learnable[]> {
	const cached = learnsetCache.get(pokedexId)
	if (cached) return cached

	try {
		const { data } = await axios.get<ApiPokemon>(`${POKEAPI_URL}/pokemon/${pokedexId}`, {
			timeout: REQUEST_TIMEOUT_MS,
		})

		const learnset = (data.moves ?? [])
			.map((entry) => {
				// The latest level any game teaches it at. The generations disagree,
				// and some file a signature move at level 1 because it is what a
				// freshly evolved Pokemon relearns — reading that as "available from
				// the start" is how a level 5 Dracaufeu ended up with Boutefeu.
				const levels = entry.version_group_details
					.filter((detail) => detail.move_learn_method.name === 'level-up')
					.map((detail) => detail.level_learned_at)
					.filter((level) => level > 0)
				return { url: entry.move.url, level: levels.length > 0 ? Math.max(...levels) : 0 }
			})
			.filter((entry) => entry.level > 0)

		learnsetCache.set(pokedexId, learnset)
		return learnset
	} catch {
		// Not cached: PokeAPI being down is not an answer about this species.
		return []
	}
}

/**
 * The attacks this Pokemon knows at this level: four of them, strongest per type.
 *
 * Two rules, and both matter:
 *
 *  - **nothing it has not reached.** The moveset is filtered by level, so a
 *    level 5 Magicarpe throws Charge and a level 60 Léviator throws
 *    Hydrocanon. Handing everyone their final arsenal was tried first and
 *    doubled the damage of every low-level camp — the band a camp teaches is
 *    balanced around what its trainees can actually do.
 *  - **strongest per type**, not simply the four strongest: the engine picks
 *    its move off the matchup (`improviseMove`), so a Dracaufeu holding four
 *    Fire moves would have nothing to throw at another Dracaufeu. One move per
 *    type, the hardest-hitting of each, gives it something that connects.
 *
 * Empty when PokeAPI is unreachable or has nothing usable, which the engine
 * reads as "improvise off the attacker's own types" — the behaviour this
 * replaced, kept as its fallback.
 */
export async function fetchMoveset(pokedexId: number, level: number): Promise<MoveSpec[]> {
	const reached = Math.max(1, Math.round(level))
	const key = `${pokedexId}:${reached}`
	const cached = movesetCache.get(key)
	if (cached) return cached

	const learnset = await fetchLearnset(pokedexId)
	const damaging = async (entries: Learnable[]): Promise<MoveSpec[]> =>
		(await Promise.all(entries.slice(0, MOVE_CANDIDATES).map(({ url }) => fetchMove(url)))).filter(
			(spec): spec is MoveSpec => spec !== null,
		)

	// Latest first: what it has just learnt is what it fights with.
	const reachedMoves = learnset.filter((entry) => entry.level <= reached).sort((a, b) => b.level - a.level)
	let specs = await damaging(reachedMoves)

	/*
	 * Nothing it can attack with yet — and that happens.
	 *
	 * A freshly opened level 5 Magicarpe knows Trempette and nothing else, and
	 * a sparring partner with no attack at all would stand there for six
	 * rounds. So the moves it is *about* to learn are allowed in, earliest
	 * first: they are its weakest, so the band it trains in is not inflated by
	 * borrowing them a few levels early.
	 */
	if (specs.length === 0) {
		const upcoming = learnset.filter((entry) => entry.level > reached).sort((a, b) => a.level - b.level)
		specs = await damaging(upcoming)
	}

	const strongestPerType = new Map<string, MoveSpec>()
	for (const spec of specs) {
		const held = strongestPerType.get(spec.type)
		if (!held || spec.power > held.power) strongestPerType.set(spec.type, spec)
	}

	const moveset = [...strongestPerType.values()].sort((a, b) => b.power - a.power).slice(0, MOVESET_SIZE)

	// An empty answer is not cached: the lookup may simply have failed, and the
	// next fight deserves another try.
	if (moveset.length > 0) movesetCache.set(key, moveset)
	return moveset
}
