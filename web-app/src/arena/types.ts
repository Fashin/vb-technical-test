/**
 * Pokemon type presentation.
 *
 * Only the ten types the masters specialise in are listed; `typeStyle` falls
 * back to a neutral chip for anything else, so adding an eleventh master does
 * not crash the roster over a missing colour.
 */
interface TypeStyle {
	label: string
	chip: string
}

const TYPES: Record<string, TypeStyle> = {
	grass: { label: 'Plante', chip: 'bg-green-600 text-green-50' },
	fire: { label: 'Feu', chip: 'bg-orange-600 text-orange-50' },
	water: { label: 'Eau', chip: 'bg-sky-600 text-sky-50' },
	electric: { label: 'Électrik', chip: 'bg-amber-400 text-amber-950' },
	bug: { label: 'Insecte', chip: 'bg-lime-600 text-lime-50' },
	poison: { label: 'Poison', chip: 'bg-fuchsia-700 text-fuchsia-50' },
	psychic: { label: 'Psy', chip: 'bg-pink-600 text-pink-50' },
	rock: { label: 'Roche', chip: 'bg-stone-500 text-stone-50' },
	fighting: { label: 'Combat', chip: 'bg-red-700 text-red-50' },
	dragon: { label: 'Dragon', chip: 'bg-indigo-600 text-indigo-50' },
}

const UNKNOWN: TypeStyle = { label: 'Inconnu', chip: 'bg-slate-600 text-slate-100' }

export function typeStyle(type: string): TypeStyle {
	return TYPES[type] ?? UNKNOWN
}
