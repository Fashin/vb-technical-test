import {
	GiBoxingGlove,
	GiCrescentBlade,
	GiDragonHead,
	GiFairyWand,
	GiFeather,
	GiFire,
	GiGroundbreaker,
	GiLadybug,
	GiLightningArc,
	GiGhost,
	GiPawPrint,
	GiPoisonBottle,
	GiPsychicWaves,
	GiSnowflake1,
	GiSteelClaws,
	GiStoneBlock,
	GiThreeLeaves,
	GiWaterDrop,
} from 'react-icons/gi'
import type { IconType } from 'react-icons'

/**
 * A glyph per Pokémon type.
 *
 * The games' own type symbols are not ours to ship, so these are the closest
 * thing in the icon set the rest of the app already draws from — a drop for
 * Eau, a flame for Feu, a paw for Normal. The glyph is never the only label:
 * wherever one is drawn the type's French name is read out beside it or as its
 * accessible name, so nothing depends on recognising the picture.
 */
const ICONS: Record<string, IconType> = {
	normal: GiPawPrint,
	fire: GiFire,
	water: GiWaterDrop,
	electric: GiLightningArc,
	grass: GiThreeLeaves,
	ice: GiSnowflake1,
	fighting: GiBoxingGlove,
	poison: GiPoisonBottle,
	ground: GiGroundbreaker,
	flying: GiFeather,
	psychic: GiPsychicWaves,
	bug: GiLadybug,
	rock: GiStoneBlock,
	ghost: GiGhost,
	dragon: GiDragonHead,
	dark: GiCrescentBlade,
	steel: GiSteelClaws,
	fairy: GiFairyWand,
}

/** Falls back to the paw, so an unexpected type still draws something. */
export function typeIcon(type: string): IconType {
	return ICONS[type] ?? GiPawPrint
}
