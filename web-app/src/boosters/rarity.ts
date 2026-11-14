import type { Rarity } from './api'

/**
 * How each rarity is shown. Rarity is never carried by colour alone: the label
 * is always rendered next to it, so the information survives a colour-blind
 * reader or a washed-out screen.
 *
 * `order` is the ranking used when sorting a collection by rarity.
 */
interface RarityStyle {
	label: string
	ring: string
	chip: string
	order: number
	/**
	 * Colour of the reveal glow, fed to the animations as the `--glow` custom
	 * property. Semi-transparent so the pulse fades instead of flashing a flat
	 * block of colour.
	 */
	glow: string
	/** Radial gradient for the burst that opens the pack. */
	burst: string
}

export const RARITY: Record<Rarity, RarityStyle> = {
	common: {
		label: 'Commune',
		ring: 'border-slate-500/60',
		chip: 'bg-slate-600 text-slate-100',
		order: 0,
		glow: 'rgba(148, 163, 184, 0.75)',
		burst: 'radial-gradient(circle, rgba(203,213,225,0.9) 0%, rgba(148,163,184,0.35) 45%, transparent 70%)',
	},
	uncommon: {
		label: 'Peu commune',
		ring: 'border-emerald-400/70',
		chip: 'bg-emerald-500 text-emerald-950',
		order: 1,
		glow: 'rgba(52, 211, 153, 0.8)',
		burst: 'radial-gradient(circle, rgba(167,243,208,0.95) 0%, rgba(16,185,129,0.4) 45%, transparent 70%)',
	},
	rare: {
		label: 'Rare',
		ring: 'border-sky-400/80',
		chip: 'bg-sky-400 text-sky-950',
		order: 2,
		glow: 'rgba(56, 189, 248, 0.85)',
		burst: 'radial-gradient(circle, rgba(186,230,253,0.95) 0%, rgba(14,165,233,0.45) 45%, transparent 70%)',
	},
	legendary: {
		label: 'Légendaire',
		ring: 'border-amber-300',
		chip: 'bg-amber-300 text-amber-950',
		order: 3,
		glow: 'rgba(252, 211, 77, 0.95)',
		burst: 'radial-gradient(circle, rgba(254,243,199,1) 0%, rgba(245,158,11,0.55) 45%, transparent 72%)',
	},
}

/** The best card in a pack — it decides the colour of the opening burst. */
export function bestRarity(rarities: Rarity[]): Rarity {
	return rarities.reduce((best, current) => (RARITY[current].order > RARITY[best].order ? current : best), 'common')
}
