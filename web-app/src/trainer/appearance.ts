/**
 * Trainer appearance.
 *
 * ⚠️ Mirrored in `backend/src/appearance/appearance.ts`, which validates the
 * indexes before storing them. The palettes themselves live here — the server
 * only needs to know how many entries each one has, so adding a colour means
 * bumping one number on the backend.
 *
 * Everything is an index into a palette rather than a raw colour: a player
 * cannot store an arbitrary string, and a repaint of the whole game is a
 * change in this file alone.
 */
export interface Appearance {
	skin: number
	hair: number
	hairColor: number
	shirt: number
	trousers: number
	hat: number
	/** Beard or moustache: index into `FACIAL_HAIR`. It takes the hair colour. */
	facialHair: number
	/** Silhouette: index into `BUILDS`. */
	build: number
	/** What the trainer wears below the waist: index into `BOTTOMS`. */
	bottom: number
	/**
	 * Arena badge worn on the chest: index into `PIN_COLORS`, 0 for none.
	 *
	 * The only part of the look that is not a free choice — the server refuses
	 * a pin whose master has not been beaten. See `progression/badges.ts` on
	 * the backend.
	 */
	pin: number
}

export const SKIN_TONES = ['#f2c9a0', '#e0a878', '#c68642', '#8d5524', '#5c3317', '#ffd9b8']

export const HAIR_COLORS = ['#2b1a12', '#6b3f22', '#b5651d', '#e0b84c', '#d9d9d9', '#3b5bb5', '#b53b6e', '#1f8f6a']

export const CLOTH_COLORS = [
	'#e23b3b',
	'#2f7fe0',
	'#30a46c',
	'#f0b429',
	'#8b5cf6',
	'#ec4899',
	'#f5f5f5',
	'#2d333b',
	'#a8601f',
	'#14b8a6',
]

/**
 * Badge pins, in the masters' tier order, each in its master's own type
 * colour — the same hues the types wear everywhere else in the app.
 *
 * Index 0 is "no pin" and is never drawn; it holds a placeholder so the
 * palette can be indexed by the badge number the server hands out.
 */
export const PIN_COLORS = [
	'transparent',
	'#4ade80', // Garance — plante
	'#fb923c', // Cendre — feu
	'#38bdf8', // Marée — eau
	'#fbbf24', // Volt — électrik
	'#a3e635', // Dédale — insecte
	'#e879f9', // Venin — poison
	'#f472b6', // Orphée — psy
	'#a8a29e', // Granit — roche
	'#f87171', // Fracas — combat
	'#818cf8', // Draconis — dragon
]

export const HAIR_STYLES = ['Court', 'Long', 'Couettes', 'Hérissé', 'Crâne rasé'] as const
export const HAT_STYLES = ['Aucun', 'Casquette', 'Bandana'] as const

/**
 * Facial hair. It has no colour of its own: it follows the hair, which is
 * both what happens on a real head and one fewer control to fiddle with.
 */
export const FACIAL_HAIR = ['Aucune', 'Moustache', 'Bouc', 'Barbe courte', 'Barbe pleine'] as const

/**
 * Silhouette and outfit are two independent choices rather than one "gender"
 * switch: every combination is valid, and the roster gains more variety than
 * a single toggle would give it.
 */
export const BUILDS = ['Carrée', 'Fine'] as const
export const BOTTOMS = ['Pantalon', 'Jupe'] as const

export const DEFAULT_APPEARANCE: Appearance = {
	skin: 0,
	hair: 0,
	hairColor: 1,
	shirt: 0,
	trousers: 1,
	hat: 1,
	facialHair: 0,
	build: 0,
	bottom: 0,
	pin: 0,
}

const SIZES: Record<keyof Appearance, number> = {
	skin: SKIN_TONES.length,
	hair: HAIR_STYLES.length,
	hairColor: HAIR_COLORS.length,
	shirt: CLOTH_COLORS.length,
	trousers: CLOTH_COLORS.length,
	hat: HAT_STYLES.length,
	facialHair: FACIAL_HAIR.length,
	build: BUILDS.length,
	bottom: BOTTOMS.length,
	pin: PIN_COLORS.length,
}

/** Clamp anything that arrives from the network into a drawable appearance. */
export function sanitizeAppearance(value: unknown): Appearance {
	const input = (value ?? {}) as Partial<Record<keyof Appearance, unknown>>
	const result = { ...DEFAULT_APPEARANCE }

	for (const key of Object.keys(SIZES) as (keyof Appearance)[]) {
		const raw = input[key]
		if (typeof raw !== 'number' || !Number.isInteger(raw)) continue
		result[key] = Math.min(Math.max(raw, 0), SIZES[key] - 1)
	}
	return result
}

/** Stable key for memoising a drawn sprite. */
export function appearanceKey(appearance: Appearance): string {
	return [
		appearance.skin,
		appearance.hair,
		appearance.hairColor,
		appearance.shirt,
		appearance.trousers,
		appearance.hat,
		appearance.facialHair,
		appearance.build,
		appearance.bottom,
		appearance.pin,
	].join('-')
}
