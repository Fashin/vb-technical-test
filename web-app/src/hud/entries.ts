import type { ComponentType } from 'react'
import {
	GiCardPickup,
	GiCardRandom,
	GiCog,
	GiCrossedSwords,
	GiPodium,
	GiPokecog,
	GiScissors,
	GiTrophy,
} from 'react-icons/gi'

/** The panels the HUD can open. */
export type HudAction =
	| 'booster'
	| 'collection'
	| 'team'
	| 'arena'
	| 'ranking'
	| 'achievements'
	| 'barber'
	| 'options'

export interface HudEntry {
	action: HudAction
	label: string
	Icon: ComponentType<{ className?: string }>
}

/**
 * The actions, in order — shared by the desktop icon bar and the touch drawer,
 * so the two can never drift apart.
 */
export const ENTRIES: HudEntry[] = [
	{ action: 'booster', label: 'Booster', Icon: GiCardPickup },
	{ action: 'collection', label: 'Ma collection', Icon: GiCardRandom },
	{ action: 'team', label: 'Mon équipe', Icon: GiPokecog },
	{ action: 'arena', label: 'Arène', Icon: GiCrossedSwords },
	{ action: 'ranking', label: 'Classement', Icon: GiPodium },
	{ action: 'achievements', label: 'Succès', Icon: GiTrophy },
	{ action: 'barber', label: 'Coiffeur', Icon: GiScissors },
	{ action: 'options', label: 'Options', Icon: GiCog },
]

export interface HudBadges {
	/** Counters to surface on the entries, e.g. boosters waiting to be opened. */
	badges?: Partial<Record<HudAction, number>>
}
