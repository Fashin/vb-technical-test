/**
 * Trainer appearance, server side.
 *
 * ⚠️ Mirrored from `web-app/src/trainer/appearance.ts`, which owns the actual
 * palettes. The server only needs their sizes: its job is to guarantee that
 * whatever lands in the database is an index another client can draw, never a
 * colour string or an out-of-range number.
 */
export interface Appearance {
	skin: number
	hair: number
	hairColor: number
	shirt: number
	trousers: number
	hat: number
	/** Beard or moustache; it takes the hair colour. */
	facialHair: number
	/** Silhouette. */
	build: number
	/** Trousers or skirt. */
	bottom: number
}

/** Number of entries in each palette, mirrored from the web app. */
const SIZES: Record<keyof Appearance, number> = {
	skin: 6,
	hair: 5,
	hairColor: 8,
	shirt: 10,
	trousers: 10,
	hat: 3,
	facialHair: 5,
	build: 2,
	bottom: 2,
}

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
}

/** Clamp anything into a drawable appearance; unknown keys are dropped. */
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

/** Parse the JSON column; a corrupt row falls back to the default look. */
export function parseAppearance(stored: string | null): Appearance {
	if (!stored) return { ...DEFAULT_APPEARANCE }
	try {
		return sanitizeAppearance(JSON.parse(stored))
	} catch {
		return { ...DEFAULT_APPEARANCE }
	}
}

/**
 * A new trainer should not look like every other new trainer: derive a varied
 * but stable starting look from the account id.
 */
export function appearanceForId(id: string): Appearance {
	let hash = 0
	for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	const at = (shift: number, size: number) => Math.floor(hash / shift) % size

	return {
		skin: at(1, SIZES.skin),
		hair: at(7, SIZES.hair),
		hairColor: at(31, SIZES.hairColor),
		shirt: at(131, SIZES.shirt),
		trousers: at(613, SIZES.trousers),
		hat: at(2791, SIZES.hat),
		facialHair: at(104729, SIZES.facialHair),
		build: at(9907, SIZES.build),
		bottom: at(37, SIZES.bottom),
	}
}
