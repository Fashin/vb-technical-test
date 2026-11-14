import type { Rarity } from './api'

/**
 * How each rarity is shown. Rarity is never carried by colour alone: the label
 * is always rendered next to it, so the information survives a colour-blind
 * reader or a washed-out screen.
 *
 * `order` is the ranking used when sorting a collection by rarity.
 */
export const RARITY: Record<Rarity, { label: string; ring: string; chip: string; order: number }> = {
	common: { label: 'Commune', ring: 'border-slate-500/60', chip: 'bg-slate-600 text-slate-100', order: 0 },
	uncommon: {
		label: 'Peu commune',
		ring: 'border-emerald-400/70',
		chip: 'bg-emerald-500 text-emerald-950',
		order: 1,
	},
	rare: { label: 'Rare', ring: 'border-sky-400/80', chip: 'bg-sky-400 text-sky-950', order: 2 },
	legendary: { label: 'Légendaire', ring: 'border-amber-300', chip: 'bg-amber-300 text-amber-950', order: 3 },
}
