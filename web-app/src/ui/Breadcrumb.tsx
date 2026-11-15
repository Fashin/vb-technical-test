import type { ComponentType } from 'react'

/**
 * The trail that says where a panel sits, and how to get back out of it.
 *
 * Every modal in this app is opened from the map — a camp you walked into, a
 * tab you pressed — and some open others: the collection opens a Pokémon's
 * sheet, the arena opens a battle. Without a trail those are two unrelated
 * dialogs with a "Fermer" button each, and closing one is a guess about where
 * you land.
 *
 * So the root is always the map, and it is always clickable: the crumb *is*
 * the way back, not a decoration beside it. The last item is the screen you
 * are on, carries the panel's icon and doubles as its heading — one title
 * rather than a title and a trail repeating each other.
 */
export interface Crumb {
	label: string
	/**
	 * Where this level takes you. Omitted on the last crumb, which is where
	 * you already are.
	 */
	onClick?: () => void
}

export function Breadcrumb({
	trail,
	icon: Icon,
	tone = 'text-emerald-300',
}: {
	/** Root first, current screen last. At least one item. */
	trail: Crumb[]
	/** Shown against the current crumb, so each panel keeps its identity. */
	icon?: ComponentType<{ className?: string }>
	/** Tailwind colour for that icon. */
	tone?: string
}) {
	const ancestors = trail.slice(0, -1)
	const current = trail[trail.length - 1]

	return (
		<nav aria-label="Fil d’Ariane" className="min-w-0">
			<ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
				{ancestors.map((crumb) => (
					<li key={crumb.label} className="flex items-center gap-1.5">
						{crumb.onClick ? (
							<button
								type="button"
								onClick={crumb.onClick}
								className="rounded text-sm text-slate-400 underline-offset-2 transition hover:text-slate-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
							>
								{crumb.label}
							</button>
						) : (
							<span className="text-sm text-slate-400">{crumb.label}</span>
						)}
						{/* Decoration: the list structure already carries the order. */}
						<span aria-hidden className="text-sm text-slate-600">
							›
						</span>
					</li>
				))}

				<li className="min-w-0">
					<h2
						aria-current="page"
						className="flex min-w-0 items-center gap-2 text-xl font-semibold text-slate-100"
					>
						{Icon && <Icon className={`h-6 w-6 shrink-0 ${tone}`} />}
						<span className="truncate">{current.label}</span>
					</h2>
				</li>
			</ol>
		</nav>
	)
}
