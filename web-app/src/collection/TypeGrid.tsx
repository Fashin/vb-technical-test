import { ALL_TYPES, typeIcon, typeStyle } from '../pokemon'
import { TYPE_POOL } from './dex'

/**
 * One icon per type, each wearing its own completion ring — and the type
 * filter.
 *
 * Eighteen named bars would own the whole column, so the per-type figure is
 * drawn as the ring around the icon instead: a shape the eye reads in a sweep,
 * which is all this level of detail is for. The exact fraction stays as text
 * under the icon, since a ring is an impression and not a number.
 *
 * A type nobody owns yet is drawn dimmed rather than dropped: "I have no
 * Spectre at all" is part of what a collection screen is meant to tell you.
 * Ténèbres is dropped, because the first generation has none to find — its
 * pool is zero and a ring that can never fill is just a dead button.
 */
export function TypeGrid({
	uniqueByType,
	active,
	onPick,
}: {
	uniqueByType: Record<string, number>
	active: string | null
	onPick: (type: string | null) => void
}) {
	const types = ALL_TYPES.filter((type) => TYPE_POOL[type] > 0)

	return (
		<section aria-labelledby="collection-types">
			<div className="flex items-baseline justify-between">
				<h3 id="collection-types" className="text-sm font-semibold uppercase tracking-wide text-slate-400">
					Types
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

			<ul className="mt-2 grid grid-cols-4 gap-1">
				{types.map((type) => {
					const style = typeStyle(type)
					const Icon = typeIcon(type)
					const owned = uniqueByType[type] ?? 0
					const pool = TYPE_POOL[type]
					const percent = Math.min(100, Math.round((owned / pool) * 100))
					const selected = active === type
					const empty = owned === 0

					return (
						<li key={type}>
							<button
								type="button"
								onClick={() => onPick(selected ? null : type)}
								aria-pressed={selected}
								disabled={empty}
								title={`${style.label} — ${owned} sur ${pool}`}
								aria-label={`${style.label} : ${owned} sur ${pool}. Filtrer par ce type.`}
								className={`flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
									selected ? 'bg-white/10 ring-1 ring-white/30' : 'hover:bg-white/5'
								} ${empty ? 'cursor-default opacity-40' : ''}`}
							>
								{/* The ring is the completion: a filled arc of the type's
								    own colour over an unfilled track, with the icon
								    sitting inside it. */}
								<span
									aria-hidden
									className="grid h-10 w-10 place-items-center rounded-full p-[3px]"
									style={{
										background: `conic-gradient(${style.tint} 0% ${percent}%, rgba(255,255,255,0.18) ${percent}% 100%)`,
									}}
								>
									<span className="grid h-full w-full place-items-center rounded-full bg-[#141c17]">
										<Icon className="h-5 w-5" style={{ color: style.tint }} />
									</span>
								</span>
								<span className="w-full truncate text-center text-[10px] leading-tight text-slate-400">
									{style.label}
								</span>
								<span className="text-[10px] leading-none tabular-nums text-slate-500">
									{owned}/{pool}
								</span>
							</button>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
