import type { Rarity } from '../boosters/api'
import { RARITY } from '../boosters/rarity'

/**
 * How the collection splits across the four rarities.
 *
 * A donut is the right form here and only here: four parts of one declared
 * whole, each named, read as "what is my collection made of" rather than
 * compared value by value. The total sits in the hole, because that is the
 * number people actually come for.
 *
 * **Colour follows the entity.** These are the hues rarity already wears on
 * every card chip and every pack burst, so the chart teaches nothing new — the
 * steps are the brighter ones used by the reveal glows, which is what makes
 * them legible on this dark surface.
 *
 * Validated against the panel surface (#141c17) rather than eyeballed:
 * contrast >= 3:1 on all four, worst adjacent pair CVD ΔE 9.5 (deuteranopia)
 * and 16.8 in normal vision. The common tier reads grey on purpose — "common"
 * is the unremarkable one — and rarity is never carried by colour alone: every
 * slice is named and counted in the legend beside it.
 */

/** Chart steps per rarity, drawn from the same hues as `boosters/rarity.ts`. */
const SLICE: Record<Rarity, string> = {
	common: '#94a3b8',
	uncommon: '#34d399',
	rare: '#38bdf8',
	legendary: '#fcd34d',
}

/** Painted in this order, rarest last, so the eye ends on the prize. */
const ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary']

const SIZE = 132
const STROKE = 18
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** A 2px hole between slices, expressed on the circumference. */
const GAP = 2

export function RarityDonut({ byRarity, total }: { byRarity: Record<Rarity, number>; total: number }) {
	if (total === 0) return null

	let offset = 0
	const slices = ORDER.map((rarity) => {
		const count = byRarity[rarity]
		const length = (count / total) * CIRCUMFERENCE
		const slice = { rarity, count, length, offset }
		offset += length
		return slice
	}).filter((slice) => slice.count > 0)

	return (
		<figure className="flex items-center gap-4">
			<svg
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				className="h-28 w-28 shrink-0 -rotate-90"
				role="img"
				aria-label={`Répartition des ${total} cartes par rareté`}
			>
				{slices.map(({ rarity, length, offset: start }) => (
					<circle
						key={rarity}
						cx={SIZE / 2}
						cy={SIZE / 2}
						r={RADIUS}
						fill="none"
						stroke={SLICE[rarity]}
						strokeWidth={STROKE}
						// A single slice has no neighbour to be separated from, so it
						// keeps its full length rather than losing 2px to a gap.
						strokeDasharray={`${Math.max(0, length - (slices.length > 1 ? GAP : 0))} ${CIRCUMFERENCE}`}
						strokeDashoffset={-start}
					/>
				))}
			</svg>

			{/* The legend is the chart's labelling: never colour alone. */}
			<figcaption className="min-w-0 flex-1">
				<p className="text-2xl font-semibold tabular-nums text-slate-100">
					{total}
					<span className="ml-1.5 text-base font-normal text-slate-400">
						carte{total > 1 ? 's' : ''}
					</span>
				</p>
				<ul className="mt-1.5 space-y-0.5">
					{ORDER.map((rarity) => (
						<li key={rarity} className="flex items-center gap-2 text-sm">
							<span
								aria-hidden
								className="h-2.5 w-2.5 shrink-0 rounded-sm"
								style={{ background: SLICE[rarity] }}
							/>
							<span className="flex-1 truncate text-slate-400">{RARITY[rarity].label}</span>
							<span className="tabular-nums text-slate-300">{byRarity[rarity]}</span>
							<span className="w-10 text-right tabular-nums text-slate-500">
								{total > 0 ? Math.round((byRarity[rarity] / total) * 100) : 0}%
							</span>
						</li>
					))}
				</ul>
			</figcaption>
		</figure>
	)
}
