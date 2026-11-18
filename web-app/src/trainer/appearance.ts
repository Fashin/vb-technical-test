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
	/** Headwear: index into `HAT_STYLES`. A free choice. */
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
	/**
	 * Aura burning around the trainer: index into `AURA_STYLES`, 0 for none.
	 *
	 * Earned like the pin, and refused by the server the same way: the blue one
	 * belongs to the bêta-testeurs, the gold one to whoever has beaten every
	 * master. See `AURA_BETA` and `AURA_MASTER`.
	 */
	aura: number
	/**
	 * Podium crown: index into `CROWN_STYLES`, 0 for none.
	 *
	 * The ranking's reward, and the only one that can be taken back: gold for
	 * whoever is first, iron for second, bronze for third. The server refuses a
	 * crown the account is not on the podium for, and it also clears one on the
	 * way out when the standing has moved — see `ranking/crowns.ts` on the
	 * backend — so what arrives here is always a crown its wearer holds today.
	 */
	crown: number
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
 * Auras: the two rewards worn by the character itself rather than by its
 * wardrobe.
 *
 * A crown sat oddly on an account whose only claim was being early, and it
 * fought with the hats — one slot, two meanings. An aura is drawn *around* the
 * sprite instead, so it costs no other choice and still reads instantly at
 * sixteen pixels: the trainer glows.
 *
 * Both are refused by the server unless they are earned, so the barber shows
 * them locked rather than hiding them — a reward nobody can see is not a
 * reward.
 */
export const AURA_STYLES = ['Aucune', 'Bleue', 'Dorée'] as const

/**
 * Aura colours, indexed by `Appearance.aura`.
 *
 * Index 0 is "no aura" and is never drawn; it holds a placeholder so the
 * palette can be indexed directly.
 */
export const AURA_COLORS = ['transparent', '#7fd8ff', '#ffd75e']

/** The bêta-testeurs' aura: a cold blue glow. */
export const AURA_BETA = AURA_STYLES.indexOf('Bleue')

/** Earned by beating every master in the arena: the same glow in gold. */
export const AURA_MASTER = AURA_STYLES.indexOf('Dorée')

/** What unlocks each aura, in words, for the barber's locked rows. */
export const AURA_REQUIREMENTS: Record<number, string> = {
	[AURA_BETA]: 'Aura bleue — réservée aux bêta-testeurs',
	[AURA_MASTER]: 'Aura dorée — à gagner en battant tous les maîtres',
}

/**
 * The podium crowns: first, second and third of the ranking.
 *
 * Headwear would have been the obvious slot and is the wrong one — it would
 * cost the leader their cap, and the old bêta-testeurs' crown was moved out of
 * that slot for exactly that reason. This one sits *above* the head instead,
 * drawn over whatever is worn there, so a crown takes nothing away. It is also
 * the one reward that is rented rather than owned: lose the place, lose the
 * crown.
 */
export const CROWN_STYLES = ['Aucune', 'Or', 'Fer', 'Bronze'] as const

/**
 * Crown metals, indexed by `Appearance.crown`.
 *
 * Index 0 is "no crown" and is never drawn; it holds a placeholder so the
 * palette can be indexed directly. Gold, iron and bronze read apart at
 * sixteen pixels because they differ in hue as well as in brightness — three
 * greys would have been three identical crowns.
 */
export const CROWN_COLORS = ['transparent', '#ffd75e', '#c9d2dc', '#cd7f32']

/** The ranking's first place. */
export const CROWN_GOLD = CROWN_STYLES.indexOf('Or')

/** Second place. */
export const CROWN_IRON = CROWN_STYLES.indexOf('Fer')

/** Third place. */
export const CROWN_BRONZE = CROWN_STYLES.indexOf('Bronze')

/** Crowns in podium order, so a place maps straight onto one. */
export const CROWNS = [CROWN_GOLD, CROWN_IRON, CROWN_BRONZE]

/** What unlocks each crown, in words, for the barber's locked rows. */
export const CROWN_REQUIREMENTS: Record<number, string> = {
	[CROWN_GOLD]: 'Couronne d’or — au premier du classement',
	[CROWN_IRON]: 'Couronne de fer — au deuxième du classement',
	[CROWN_BRONZE]: 'Couronne de bronze — au troisième du classement',
}

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
	aura: 0,
	crown: 0,
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
	aura: AURA_STYLES.length,
	crown: CROWN_STYLES.length,
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
		appearance.aura,
		appearance.crown,
	].join('-')
}
