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

export const HAIR_STYLES = ['Court', 'Long', 'Couettes', 'Hérissé', 'Crâne rasé'] as const
export const HAT_STYLES = ['Aucun', 'Casquette', 'Bandana'] as const

export const DEFAULT_APPEARANCE: Appearance = {
	skin: 0,
	hair: 0,
	hairColor: 1,
	shirt: 0,
	trousers: 1,
	hat: 1,
}

const SIZES: Record<keyof Appearance, number> = {
	skin: SKIN_TONES.length,
	hair: HAIR_STYLES.length,
	hairColor: HAIR_COLORS.length,
	shirt: CLOTH_COLORS.length,
	trousers: CLOTH_COLORS.length,
	hat: HAT_STYLES.length,
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
	return `${appearance.skin}-${appearance.hair}-${appearance.hairColor}-${appearance.shirt}-${appearance.trousers}-${appearance.hat}`
}
