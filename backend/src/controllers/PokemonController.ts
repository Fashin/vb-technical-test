import { type Request, type Response, Router } from 'express'

import { rateLimit } from '../auth/middleware'
import { fetchPokemon } from '../services/pokeapi'

const PokemonController = Router()

/** Generations 1 to 8, as the brief asks. */
const LAST_POKEDEX_ID = 898

/**
 * Public, so it is throttled: every call here is an outbound burst to PokeAPI,
 * and PokeAPI asks its clients not to hammer it.
 */
const lookupLimiter = rateLimit(120, 60 * 1000)

export interface PokemonType {
	name: string
	image: string
}

export interface StatBlock {
	HP: number
	attack: number
	defense: number
	special_attack: number
	special_defense: number
	speed: number
}

export type DamageRelation =
	| 'neutral'
	| 'resistant'
	| 'twice_resistant'
	| 'vulnerable'
	| 'twice_vulnerable'
	| 'immune'

export interface Resistance {
	name: string
	damage_multiplier: number
	damage_relation: DamageRelation
}

export interface Ability {
	name: string
	slug: string
}

export interface Evolution {
	name: string
	pokedexId: number
}

export interface Pokemon {
	id: number
	pokedexId: number
	name: string
	image: string
	sprite: string
	slug: string
	stats: StatBlock
	apiTypes: PokemonType[]
	apiGeneration: number
	apiResistances: Resistance[]
	resistanceModifyingAbilitiesForApi: Ability
	apiEvolutions: Evolution[]
	apiPreEvolution: string | 'none'
	apiResistancesWithAbilities: Resistance[]
}

/**
 * The Pokedex id a request is asking for, or null.
 *
 * Only a number in range is accepted. The value ends up in an outbound URL, so
 * letting arbitrary text through would mean letting the caller write part of
 * the request this server makes on its behalf.
 */
export function parsePokedexId(raw: unknown): number | null {
	const id = Number(raw)
	if (!Number.isInteger(id) || id < 1 || id > LAST_POKEDEX_ID) return null
	return id
}

/**
 * One Pokemon, adapted from PokeAPI to this project's shape.
 *
 * @route GET /pokemons/:id
 */
PokemonController.get('/:id', lookupLimiter, async (req: Request, res: Response) => {
	const pokedexId = parsePokedexId(req.params.id)
	if (pokedexId === null) {
		return res
			.status(400)
			.json({ error: { code: 'INVALID_ID', message: `L’identifiant doit être un entier de 1 à ${LAST_POKEDEX_ID}` } })
	}

	try {
		const pokemon = await fetchPokemon(String(pokedexId))
		return res.status(200).json({ pokemon })
	} catch {
		// Upstream failures are not this API's internals to expose.
		return res
			.status(404)
			.json({ error: { code: 'POKEMON_NOT_FOUND', message: `Aucun Pokémon pour l’id ${pokedexId}` } })
	}
})

export { PokemonController, LAST_POKEDEX_ID }
