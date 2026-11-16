import type { Rarity } from '../boosters/api'
import { RARITY } from '../boosters/rarity'
import { RARITY_POOL } from './dex'

/** Listed rarest last, so the eye ends on the tier still worth chasing. */
const ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary']

/**
 * How complete the collection is, tier by tier — and the rarity filter.
 *
 * One bar per rarity rather than a pie of the four: the question here is "how
 * far am I on each tier", four independent fractions of their own pool, which
 * is a length to compare against a track and not a share of a whole. Each bar
 * is the filter for its tier, so the thing that tells you only two legendaries
 * are missing is the thing you press to go look at them.
 *
 * The counts are distinct Pokémon, not cards: duplicates do not move a
 * completion bar, and a bar that filled past its own pool would be a lie.
 */
export function RarityBars({
	uniqueByRarity,
	active,
	onPick,
}: {
	uniqueByRarity: Record<Rarity, number>
	active: Rarity | null
	onPick: (rarity: Rarity | null) => void
}) {
	return (
		<section aria-labelledby="collection-rarity">
			<div className="flex items-baseline justify-between">
				<h3 id="collection-rarity" className="text-sm font-semibold uppercase tracking-wide text-slate-400">
					Rareté
				</h3>
				{active !== null && (
					<button
						type="button"
						onClick={() => onPick(null)}
						className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Tout voir
					</button>
				)}
			</div>

			<ul className="mt-2 space-y-1.5">
				{ORDER.map((rarity) => {
					const style = RARITY[rarity]
					const owned = uniqueByRarity[rarity]
					const pool = RARITY_POOL[rarity]
					const ratio = pool === 0 ? 0 : owned / pool
					const selected = active === rarity

					return (
						<li key={rarity}>
							<button
								type="button"
								onClick={() => onPick(selected ? null : rarity)}
								aria-pressed={selected}
								// The whole row is the control, so the hit area matches
								// what the eye reads as one thing.
								className={`w-full rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
									selected
										? 'border-white/25 bg-white/10'
										: 'border-transparent hover:border-white/10 hover:bg-white/5'
								}`}
							>
								<span className="flex items-baseline justify-between gap-2">
									<span className="flex items-center gap-1.5 text-sm text-slate-200">
										<span
											aria-hidden
											className="h-2.5 w-2.5 shrink-0 rounded-sm"
											style={{ background: style.tint }}
										/>
										{style.label}
									</span>
									<span className="shrink-0 text-xs tabular-nums text-slate-400">
										{owned}
										<span className="text-slate-600">/{pool}</span>
									</span>
								</span>
								<span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-black/50">
									<span
										className="block h-full rounded-full transition-[width] duration-500"
										style={{ width: `${Math.round(ratio * 100)}%`, background: style.tint }}
									/>
								</span>
							</button>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
