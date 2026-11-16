/**
 * The five training camps.
 *
 * Game rules, so they live on the server like `arena/masters.ts`: a client
 * that rewrote the bands would be rewriting the experience table.
 *
 * Each camp teaches up to its own ceiling and no further, refuses anyone who
 * has not reached its floor, and — from the second one on — asks for arena
 * badges at the gate. That last rule is what stops a team walking to level 100
 * without ever meeting a master: every twenty levels are paid for in the
 * arena. See `progression/badges.ts`. That is the whole shape of the progression:
 * finishing a band means walking to another biome, so the ladder and the map
 * are the same thing. The order follows the distance from the spawn — the next
 * band is always the nearest corner still unexplored.
 */

/** Where a camp sits, as a corner of the map or its middle. */
export type CampAnchor = 'centre' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface Camp {
	id: string
	name: string
	title: string
	blurb: string
	anchor: CampAnchor
	/**
	 * Arena badges needed to train here at all.
	 *
	 * The gate that ties the two ladders together: a band of levels is opened
	 * by beating masters, not by grinding the band below it. The first camp
	 * asks for none, so a new player can always start somewhere.
	 */
	badges: number
	/** Lowest level allowed in: below it, the camp turns you away. */
	minLevel: number
	/** Highest level it can teach: at it, its sparring partners have nothing left. */
	maxLevel: number
	/** Pokedex ids of the wild Pokemon sparring here. */
	wild: number[]
}

export const CAMPS: Camp[] = [
	{
		id: 'centre',
		name: 'Camp des Prairies',
		title: 'Terrain d’exercice central',
		blurb: 'On commence par le commencement : tenir debout après le premier coup.',
		anchor: 'centre',
		badges: 0,
		minLevel: 1,
		maxLevel: 25,
		wild: [10, 13, 16, 19, 21, 29, 32, 43, 46, 69],
	},
	{
		id: 'rivage',
		name: 'Camp du Rivage',
		title: 'Bassins du biome d’eau',
		blurb: 'L’eau ne rend rien de ce qu’on lui donne. Entraîne-toi quand même.',
		anchor: 'bottom-left',
		badges: 2,
		minLevel: 26,
		maxLevel: 45,
		wild: [54, 60, 72, 90, 98, 116, 118, 120, 129, 138],
	},
	{
		id: 'plateau',
		name: 'Camp du Plateau',
		title: 'Perchoirs du biome d’air',
		blurb: 'Ici on apprend à frapper ce qui ne touche jamais le sol.',
		anchor: 'top-left',
		badges: 4,
		minLevel: 46,
		maxLevel: 65,
		wild: [17, 22, 35, 39, 41, 63, 83, 84, 123, 142],
	},
	{
		id: 'carriere',
		name: 'Camp de la Carrière',
		title: 'Fosses du biome de terre',
		blurb: 'La pierre ne s’écarte pas. C’est tout l’exercice.',
		anchor: 'bottom-right',
		badges: 6,
		minLevel: 66,
		maxLevel: 85,
		wild: [27, 50, 56, 66, 74, 75, 95, 104, 111, 112],
	},
	{
		id: 'forge',
		name: 'Camp de la Forge',
		title: 'Braises du biome de feu',
		blurb: 'Dernière marche. On ne vient pas ici pour apprendre à encaisser.',
		anchor: 'top-right',
		badges: 8,
		minLevel: 86,
		maxLevel: 100,
		wild: [4, 6, 37, 58, 59, 77, 78, 88, 109, 126],
	},
]

export function findCamp(id: string): Camp | undefined {
	return CAMPS.find((camp) => camp.id === id)
}
