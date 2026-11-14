import type { Appearance } from '../appearance/appearance'

/**
 * The ten masters of the arena.
 *
 * They are defined on the server, not in the web app, because they are game
 * rules: what you fight, how hard it is and what it pays. A client that
 * rewrote them would be rewriting the reward table.
 *
 * Names are invented rather than borrowed from the official games — these are
 * this project's characters, and they each get an `appearance` so the same
 * procedural trainer renderer that draws the players draws them too.
 *
 * Teams are Kanto-only, matching the card pools the boosters draw from, and
 * ordered by `tier`: an opening team of unevolved Pokemon up to a full stage-3
 * line at the end.
 */
export interface Master {
	id: string
	name: string
	title: string
	/** Pokemon type the master specialises in, lowercase, as PokeAPI names it. */
	type: string
	/** One line of flavour, also used as the taunt before the battle. */
	blurb: string
	/** Difficulty, 1 to 10. The arena is listed in this order. */
	tier: number
	/** Pokedex ids of the three fighters, in the order they are sent out. */
	team: number[]
	/** Boosters awarded the first time this master is beaten. */
	reward: number
	appearance: Appearance
}

export const MASTERS: Master[] = [
	{
		id: 'garance',
		name: 'Garance',
		title: 'Dame des Herbes Hautes',
		type: 'grass',
		blurb: 'Rien ne pousse sans patience. Montre-moi la tienne.',
		tier: 1,
		team: [43, 69, 2],
		reward: 1,
		appearance: { skin: 0, hair: 1, hairColor: 7, shirt: 2, trousers: 8, hat: 0, facialHair: 0, build: 1, bottom: 1 },
	},
	{
		id: 'cendre',
		name: 'Cendre',
		title: 'Gardien de la Forge',
		type: 'fire',
		blurb: 'Le métal se travaille chaud. Les dresseurs aussi.',
		tier: 2,
		team: [37, 58, 5],
		reward: 1,
		appearance: { skin: 2, hair: 0, hairColor: 0, shirt: 0, trousers: 7, hat: 2, facialHair: 4, build: 0, bottom: 0 },
	},
	{
		id: 'maree',
		name: 'Marée',
		title: 'Pêcheuse des Récifs',
		type: 'water',
		blurb: 'La vague ne force jamais. Elle revient, simplement.',
		tier: 3,
		team: [61, 117, 8],
		reward: 1,
		appearance: { skin: 1, hair: 2, hairColor: 4, shirt: 1, trousers: 7, hat: 1, facialHair: 0, build: 1, bottom: 0 },
	},
	{
		id: 'volt',
		name: 'Volt',
		title: 'Bricoleur de la Centrale',
		type: 'electric',
		blurb: 'J’ai recâblé tout le quartier. Un dresseur, ça ira vite.',
		tier: 4,
		team: [82, 125, 26],
		reward: 2,
		appearance: { skin: 5, hair: 3, hairColor: 3, shirt: 3, trousers: 1, hat: 0, facialHair: 1, build: 0, bottom: 0 },
	},
	{
		id: 'dedale',
		name: 'Dédale',
		title: 'Éleveur de la Chênaie',
		type: 'bug',
		blurb: 'Six pattes, deux ailes, et plus de ruse que toi.',
		tier: 5,
		team: [12, 15, 123],
		reward: 2,
		appearance: { skin: 3, hair: 0, hairColor: 1, shirt: 9, trousers: 8, hat: 1, facialHair: 2, build: 0, bottom: 0 },
	},
	{
		id: 'venin',
		name: 'Venin',
		title: 'Apothicaire des Marais',
		type: 'poison',
		blurb: 'Tout est poison, c’est la dose qui décide. Tu en veux combien ?',
		tier: 6,
		team: [89, 110, 34],
		reward: 2,
		appearance: { skin: 4, hair: 4, hairColor: 0, shirt: 4, trousers: 7, hat: 0, facialHair: 0, build: 1, bottom: 1 },
	},
	{
		id: 'orphee',
		name: 'Orphée',
		title: 'Lectrice d’Esprits',
		type: 'psychic',
		blurb: 'J’ai déjà vu ce combat. Il ne finit pas bien pour toi.',
		tier: 7,
		team: [97, 122, 65],
		reward: 2,
		appearance: { skin: 1, hair: 1, hairColor: 6, shirt: 5, trousers: 4, hat: 2, facialHair: 0, build: 1, bottom: 1 },
	},
	{
		id: 'granit',
		name: 'Granit',
		title: 'Tailleur de Pierre',
		type: 'rock',
		blurb: 'On ne contourne pas une montagne. On apprend à grimper.',
		tier: 8,
		team: [75, 95, 76],
		reward: 3,
		appearance: { skin: 3, hair: 4, hairColor: 4, shirt: 8, trousers: 7, hat: 0, facialHair: 3, build: 0, bottom: 0 },
	},
	{
		id: 'fracas',
		name: 'Fracas',
		title: 'Champion du Dojo',
		type: 'fighting',
		blurb: 'Pas de stratégie ici. Juste qui tient debout le plus longtemps.',
		tier: 9,
		team: [57, 106, 68],
		reward: 3,
		appearance: { skin: 2, hair: 3, hairColor: 0, shirt: 7, trousers: 0, hat: 0, facialHair: 1, build: 0, bottom: 0 },
	},
	{
		id: 'draconis',
		name: 'Draconis',
		title: 'Maître du Repaire',
		type: 'dragon',
		blurb: 'Les autres t’ont préparé. Moi, je te juge.',
		tier: 10,
		team: [148, 130, 149],
		reward: 3,
		appearance: { skin: 0, hair: 1, hairColor: 5, shirt: 6, trousers: 7, hat: 0, facialHair: 3, build: 0, bottom: 0 },
	},
]

export function findMaster(id: string): Master | undefined {
	return MASTERS.find((master) => master.id === id)
}
