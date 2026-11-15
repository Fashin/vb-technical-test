import { MASTERS } from '../arena/masters'
import { DEX_TOTAL } from '../boosters/rarity'
import { CAMPS } from '../training/camps'

/**
 * The achievement catalogue.
 *
 * Definitions only: what each one is worth and how far along you are is
 * computed in `achievements.ts` from the tables that already hold the truth.
 * Nothing here is stored per player, so an achievement can never disagree with
 * what the player actually did, and adding one costs a row in this file rather
 * than a migration.
 *
 * The master entries are generated from the arena roster itself: adding an
 * eleventh master adds its achievement, with no second list to keep in step.
 */

export type Category = 'arene' | 'pokedex' | 'entrainement' | 'dresseur'

export interface Achievement {
	id: string
	name: string
	description: string
	category: Category
	/** What "done" means; progress is reported against it. */
	target: number
	/** Hidden until unlocked — kept for the rarest ones, never for a milestone. */
	secret?: boolean
}

/** The five legendaries a booster can draw. */
export const LEGENDARIES = [144, 145, 146, 150, 151]

const masterAchievements: Achievement[] = [...MASTERS]
	.sort((a, b) => a.tier - b.tier)
	.map((master) => ({
		id: `master:${master.id}`,
		name: `${master.name} vaincu`,
		description: `Battre ${master.name}, ${master.title.toLowerCase()}, dans l’arène.`,
		category: 'arene' as const,
		target: 1,
	}))

/** One graduation per camp: the ladder of bands, and so of biomes. */
const campAchievements: Achievement[] = CAMPS.map((camp, index) => ({
	id: `camp:${camp.id}`,
	name: `Diplômé du ${camp.name}`,
	description:
		index === CAMPS.length - 1
			? `Amener un Pokémon au niveau ${camp.maxLevel}, le plafond absolu.`
			: `Amener un Pokémon au niveau ${camp.maxLevel}, la limite de ce camp.`,
	category: 'entrainement' as const,
	target: camp.maxLevel,
}))

export const ACHIEVEMENTS: Achievement[] = [
	/* ---------------------------------- arène ---------------------------------- */
	...masterAchievements,
	{
		id: 'arena:all',
		name: 'Maître de l’arène',
		description: `Battre les ${MASTERS.length} maîtres de l’arène.`,
		category: 'arene',
		target: MASTERS.length,
	},

	/* --------------------------------- pokédex --------------------------------- */
	{
		id: 'dex:first',
		name: 'Premier pas',
		description: 'Posséder sa première carte.',
		category: 'pokedex',
		target: 1,
	},
	{
		id: 'dex:half',
		name: 'Pokédex à moitié',
		description: `Posséder ${Math.floor(DEX_TOTAL / 2)} Pokémon différents.`,
		category: 'pokedex',
		target: Math.floor(DEX_TOTAL / 2),
	},
	{
		id: 'dex:complete',
		name: 'Pokédex complet',
		description: `Posséder les ${DEX_TOTAL} Pokémon que les boosters peuvent donner.`,
		category: 'pokedex',
		target: DEX_TOTAL,
	},
	{
		id: 'dex:legendaries',
		name: 'Légende vivante',
		description: 'Posséder les cinq légendaires.',
		category: 'pokedex',
		target: LEGENDARIES.length,
	},
	{
		id: 'cards:fifty',
		name: 'Collectionneur',
		description: 'Posséder 50 cartes, doublons compris.',
		category: 'pokedex',
		target: 50,
	},
	{
		id: 'cards:hundred',
		name: 'Archiviste',
		description: 'Posséder 150 cartes, doublons compris.',
		category: 'pokedex',
		target: 150,
	},

	/* ------------------------------- entraînement ------------------------------- */
	...campAchievements,

	/* --------------------------------- dresseur --------------------------------- */
	{
		id: 'team:full',
		name: 'Équipe au complet',
		description: 'Aligner une équipe de six Pokémon.',
		category: 'dresseur',
		target: 6,
	},
	{
		id: 'duel:first',
		name: 'Premier sang',
		description: 'Gagner un duel contre un autre dresseur.',
		category: 'dresseur',
		target: 1,
	},
	{
		id: 'duel:five',
		name: 'Terreur des routes',
		description: 'Gagner cinq duels contre d’autres dresseurs.',
		category: 'dresseur',
		target: 5,
	},
	{
		id: 'trade:first',
		name: 'Donnant-donnant',
		description: 'Conclure un échange avec un autre dresseur.',
		category: 'dresseur',
		target: 1,
	},
]

export const CATEGORY_LABELS: Record<Category, string> = {
	arene: 'Arène',
	pokedex: 'Pokédex',
	entrainement: 'Entraînement',
	dresseur: 'Dresseur',
}
