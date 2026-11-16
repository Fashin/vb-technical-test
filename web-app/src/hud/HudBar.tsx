import { ENTRIES, type HudAction, type HudBadges } from './entries'

interface HudBarProps extends HudBadges {
	/** Called with the entry that was clicked. */
	onSelect?: (action: HudAction) => void
	/** Highlighted entry, when its panel is open. */
	active?: HudAction | null
}

/**
 * Bottom-left action bar, for pointers and keyboards.
 *
 * Icons only, with the name revealed on hover — the map is the screen, the HUD
 * should not eat into it. `aria-label` carries the name for anyone not using a
 * mouse, since the visible label is hover-only.
 *
 * Touch screens get `HudMenu` instead: eight 56px targets in a row do not fit
 * a phone, and there is no hover to reveal what they do.
 */
export function HudBar({ onSelect, active = null, badges }: HudBarProps) {
	return (
		<nav
			aria-label="Actions"
			className="pointer-events-auto absolute bottom-3 left-3 flex items-end gap-2"
		>
			{ENTRIES.map(({ action, label, Icon }) => {
				const badge = badges?.[action] ?? 0
				return (
				<button
					key={action}
					type="button"
					data-tutorial={action}
					onClick={() => onSelect?.(action)}
					aria-label={badge > 0 ? `${label} (${badge})` : label}
					aria-pressed={active === action}
					className={`group relative flex h-14 w-14 items-center justify-center rounded-lg border backdrop-blur transition
						${
							active === action
								? 'border-emerald-400 bg-emerald-500/25 text-emerald-200'
								: 'border-white/15 bg-black/55 text-slate-200 hover:border-white/40 hover:bg-black/75 hover:text-white'
						}`}
				>
					<Icon className="h-7 w-7" />
					{badge > 0 && (
						<span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-amber-950">
							{badge}
						</span>
					)}
					<span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-sm text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
						{label}
					</span>
				</button>
				)
			})}
		</nav>
	)
}
