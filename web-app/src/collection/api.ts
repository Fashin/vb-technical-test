import { API_URL } from '../auth/api'

/**
 * One Pokémon in full, from the server's own adaptation of PokeAPI.
 *
 * Mirrored from `backend/src/controllers/PokemonController.ts`. This is the
 * route the brief asked for and the only consumer of it: the collection's
 * detail view. The card listing carries types and headline stats already —
 * this adds what only a detail screen needs, the matchups and the family.
 */
export interface PokemonType {
	name: string
	image: string
}

export interface Resistance {
	name: string
	damage_multiplier: number
	damage_relation: string
}

export interface Evolution {
	name: string
	pokedexId: number
}

export interface PokemonDetail {
	pokedexId: number
	name: string
	image: string
	sprite: string
	slug: string
	stats: {
		HP: number
		attack: number
		defense: number
		special_attack: number
		special_defense: number
		speed: number
	}
	apiTypes: PokemonType[]
	apiGeneration: number
	apiResistances: Resistance[]
	apiEvolutions: Evolution[]
	apiPreEvolution: string | 'none'
}

export class PokedexError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'PokedexError'
	}
}

/** Public route: no token needed, and none is sent. */
export async function fetchPokemon(pokedexId: number): Promise<PokemonDetail> {
	const response = await fetch(`${API_URL}/pokemons/${pokedexId}`)
	const body = await response.json().catch(() => null)

	if (!response.ok) {
		const error = (body as { error?: { message: string } } | null)?.error
		throw new PokedexError(error?.message ?? 'Pokémon introuvable')
	}
	return (body as { pokemon: PokemonDetail }).pokemon
}
