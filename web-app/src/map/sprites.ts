/** PokeAPI front sprite for a pokedex id — the avatar every player walks as. */
export function spriteUrlFor(pokedexId: number): string {
	return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokedexId}.png`
}
