import { GiExitDoor } from 'react-icons/gi'
import { HiMenu, HiX } from 'react-icons/hi'

import { ENTRIES, type HudAction, type HudBadges } from './entries'

interface HudMenuProps extends HudBadges {
	/** Whether the drawer is out. Owned by the scene, since the tour opens it too. */
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Called with the entry that was tapped; the drawer closes itself. */
	onSelect?: (action: HudAction) => void
	/** Highlighted entry, when its panel is open. */
	active?: HudAction | null
	/** Shown at the foot of the drawer: on a phone the top bar has no room for it. */
	onLogout?: () => void
	/** Name of the trainer, as a header for the drawer. */
	trainerName?: string
}

/**
 * The touch HUD: one thumb-sized button, and a drawer that slides in from the
 * right with the eight actions as full rows.
 *
 * Why a drawer and not the icon bar: eight icons in a row is 460px, wider than
 * a phone, and the labels on the bar are revealed by hover, which a finger
 * does not have. Rows carry their name, so nothing has to be guessed.
 *
 * It opens from the right because the left thumb is on the joystick. The
 * button sits above the bottom edge rather than in the corner, clear of the
 * browser's own gesture strip.
 */
export function HudMenu({
	open,
	onOpenChange,
	onSelect,
	active = null,
	badges,
	onLogout,
	trainerName,
}: HudMenuProps) {
	const waiting = ENTRIES.reduce((total, { action }) => total + (badges?.[action] ?? 0), 0)

	return (
		<>
			{/* Tap anywhere else to put it away. Only mounted while open, so it
			    never steals a tap meant for the map. */}
			{open && (
				<button
					type="button"
					aria-label="Fermer le menu"
					onClick={() => onOpenChange(false)}
					className="pointer-events-auto absolute inset-0 z-20 cursor-default bg-black/40"
				/>
			)}

			<button
				type="button"
				data-tutorial="menu"
				aria-label={waiting > 0 ? `Menu (${waiting})` : 'Menu'}
				aria-expanded={open}
				onClick={() => onOpenChange(!open)}
				className="pointer-events-auto absolute bottom-6 right-4 z-30 flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/65 text-slate-100 shadow-lg backdrop-blur active:bg-black/85"
			>
				{open ? <HiX className="h-8 w-8" /> : <HiMenu className="h-8 w-8" />}
				{!open && waiting > 0 && (
					<span className="absolute -right-0.5 -top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-amber-950">
						{waiting}
					</span>
				)}
			</button>

			{/* Always mounted, so it can slide — and so the tour can measure a row
			    the moment it asks for the drawer. `aria-hidden` while it is out of
			    the way keeps it off the screen reader's path. */}
			<nav
				aria-label="Actions"
				aria-hidden={!open}
				className={`pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-72 max-w-[82vw] flex-col border-l border-white/10 bg-[#101710]/95 shadow-2xl backdrop-blur transition-transform duration-200 ${
					open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
				}`}
			>
				<p className="truncate border-b border-white/10 px-4 py-3 text-sm font-medium uppercase tracking-wide text-emerald-300">
					{trainerName ?? 'Menu'}
				</p>

				<div className="flex-1 overflow-y-auto overscroll-contain py-2">
					{ENTRIES.map(({ action, label, Icon }) => {
						const badge = badges?.[action] ?? 0
						return (
							<button
								key={action}
								type="button"
								data-tutorial={action}
								tabIndex={open ? 0 : -1}
								aria-pressed={active === action}
								onClick={() => {
									onSelect?.(action)
									onOpenChange(false)
								}}
								className={`flex w-full items-center gap-3 px-4 py-3 text-left text-base transition ${
									active === action
										? 'bg-emerald-500/20 text-emerald-200'
										: 'text-slate-200 active:bg-white/10'
								}`}
							>
								<Icon className="h-7 w-7 shrink-0" />
								<span className="flex-1">{label}</span>
								{badge > 0 && (
									<span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-amber-950">
										{badge}
									</span>
								)}
							</button>
						)
					})}
				</div>

				{onLogout && (
					<button
						type="button"
						tabIndex={open ? 0 : -1}
						onClick={onLogout}
						className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-left text-base text-slate-400 active:bg-white/10"
					>
						<GiExitDoor className="h-6 w-6 shrink-0" />
						Déconnexion
					</button>
				)}

				{/* Breathing room over the phone's home indicator / gesture bar. */}
				<div className="h-[env(safe-area-inset-bottom)]" />
			</nav>
		</>
	)
}
