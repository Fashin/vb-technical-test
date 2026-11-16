/**
 * Pokémon type presentation: the French name and the chip each type wears.
 *
 * All eighteen, because the collection filters on them — the arena only ever
 * needed the ten its masters specialise in, and that table lived in
 * `arena/types.ts` until a second screen wanted the same vocabulary. One table
 * rather than two that drift.
 *
 * Keys are PokeAPI's lowercase names, which is what the API returns and what
 * `backend/src/battle/types.ts` computes matchups with.
 */
export interface TypeStyle {
	label: string
	/** Tailwind classes for a chip: background and its own readable text. */
	chip: string
	/**
	 * The type's colour as a value, for the places a Tailwind class cannot
	 * reach — an SVG stroke, a conic gradient, an inline shadow.
	 *
	 * A lighter step than the chip's background on purpose: the chip carries
	 * dark text on a saturated fill, while this one is drawn as a thin line on
	 * the dark panel surface (#141c17) and has to stay visible there, so each
	 * value clears 3:1 against it.
	 */
	tint: string
}

const TYPES: Record<string, TypeStyle> = {
	normal: { label: 'Normal', chip: 'bg-stone-400 text-stone-950', tint: '#d6d3d1' },
	fire: { label: 'Feu', chip: 'bg-orange-600 text-orange-50', tint: '#fb923c' },
	water: { label: 'Eau', chip: 'bg-sky-600 text-sky-50', tint: '#38bdf8' },
	electric: { label: 'Électrik', chip: 'bg-amber-400 text-amber-950', tint: '#fbbf24' },
	grass: { label: 'Plante', chip: 'bg-green-600 text-green-50', tint: '#4ade80' },
	ice: { label: 'Glace', chip: 'bg-cyan-300 text-cyan-950', tint: '#67e8f9' },
	fighting: { label: 'Combat', chip: 'bg-red-700 text-red-50', tint: '#f87171' },
	poison: { label: 'Poison', chip: 'bg-fuchsia-700 text-fuchsia-50', tint: '#e879f9' },
	ground: { label: 'Sol', chip: 'bg-yellow-700 text-yellow-50', tint: '#c98b5e' },
	flying: { label: 'Vol', chip: 'bg-indigo-300 text-indigo-950', tint: '#a5b4fc' },
	psychic: { label: 'Psy', chip: 'bg-pink-600 text-pink-50', tint: '#f472b6' },
	bug: { label: 'Insecte', chip: 'bg-lime-600 text-lime-50', tint: '#a3e635' },
	rock: { label: 'Roche', chip: 'bg-stone-500 text-stone-50', tint: '#a8a29e' },
	ghost: { label: 'Spectre', chip: 'bg-violet-700 text-violet-50', tint: '#a78bfa' },
	dragon: { label: 'Dragon', chip: 'bg-indigo-600 text-indigo-50', tint: '#818cf8' },
	dark: { label: 'Ténèbres', chip: 'bg-neutral-700 text-neutral-50', tint: '#a3a3a3' },
	steel: { label: 'Acier', chip: 'bg-slate-400 text-slate-950', tint: '#cbd5e1' },
	fairy: { label: 'Fée', chip: 'bg-rose-400 text-rose-950', tint: '#fda4af' },
}

/** Every type, in the games' canonical order — the order filters are listed in. */
export const ALL_TYPES = Object.keys(TYPES)

const UNKNOWN: TypeStyle = { label: 'Inconnu', chip: 'bg-slate-600 text-slate-100', tint: '#94a3b8' }

/** Falls back to a neutral chip, so an unexpected type never breaks a screen. */
export function typeStyle(type: string): TypeStyle {
	return TYPES[type] ?? UNKNOWN
}
