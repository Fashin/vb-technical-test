import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useEscapeToClose } from '../ui'

/** The name a step looks for in `data-tutorial="…"`, somewhere on screen. */
export type TutorialTarget = 'booster' | 'camps' | 'center' | 'arena' | 'joystick' | 'menu'

interface Step {
	target: TutorialTarget
	title: string
	body: string
}

/**
 * The tour, in order.
 *
 * Two steps point at the HUD and two at the minimap, because that is where
 * those features actually live: boosters and the arena are panels, while the
 * camps and the healing centre are places you walk to.
 */
const STEPS: Step[] = [
	{
		target: 'booster',
		title: 'Voici vos boosters',
		body: 'Ouvrez-les pour découvrir de nouveaux Pokémon et agrandir votre collection.',
	},
	{
		target: 'camps',
		title: 'Entraînez vos Pokémon',
		body: 'Les repères jaunes de la carte sont les camps d’entraînement. Marchez dessus pour y entrer et faire monter votre équipe en niveau.',
	},
	{
		target: 'center',
		title: 'Soignez-les ici',
		body: 'S’ils sont blessés, emmenez-les au centre de soins — le repère blanc à la croix rouge.',
	},
	{
		target: 'arena',
		title: 'Devenez le meilleur dresseur',
		body: 'Affrontez les maîtres Pokémon à l’arène et gravissez le classement !',
	},
]

/**
 * Two extra steps for touch screens, in front of the others.
 *
 * The desktop tour can take the controls for granted: arrow keys, and eight
 * icons in plain sight. On a phone both are new — the joystick has no keyboard
 * equivalent and the icons sit behind a button — so the tour introduces them
 * before it talks about what they open.
 */
const TOUCH_STEPS: Step[] = [
	{
		target: 'joystick',
		title: 'Déplace-toi au pouce',
		body: 'Pose le pouce sur le joystick et fais-le glisser vers l’endroit où tu veux aller. Les diagonales marchent aussi.',
	},
	{
		target: 'menu',
		title: 'Ton menu est ici',
		body: 'Ce bouton ouvre toutes tes actions : boosters, collection, équipe, arène, classement…',
	},
]

/** Steps whose target lives inside the touch drawer, which therefore has to be open. */
const IN_MENU: TutorialTarget[] = ['booster', 'arena']

interface Box {
	left: number
	top: number
	width: number
	height: number
}

/** Width of the instruction card, in pixels. Centred on the target, and narrowed when the screen is. */
const CARD = 320
/** Room left between the target and the card, where the arrow is drawn. */
const GAP = 52
/** How far the highlight ring sits outside the target. */
const PAD = 8
/** Keep the card off the screen edges. */
const MARGIN = 12

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}

/** The arrow itself: a shaft and a head, pointing down unless flipped. */
function Arrow({ up }: { up: boolean }) {
	return (
		<svg
			viewBox="0 0 24 40"
			aria-hidden="true"
			className={`h-10 w-6 animate-bounce drop-shadow-[0_0_6px_rgba(0,0,0,0.8)] ${up ? 'rotate-180' : ''}`}
		>
			<path
				d="M12 3 L12 25"
				fill="none"
				stroke="#6ee7b7"
				strokeWidth="5"
				strokeLinecap="round"
			/>
			<path d="M12 38 L3 23 L21 23 Z" fill="#6ee7b7" />
		</svg>
	)
}

/**
 * The welcome tour: four steps, each one an arrow pointing at the thing it
 * talks about.
 *
 * Targets are found by their `data-tutorial` attribute rather than passed in
 * as refs, so a step can point at anything already on screen — an HUD button,
 * a marker painted inside the minimap — without that component knowing the
 * tour exists. Positions are measured after layout and again on resize, since
 * the minimap's size comes from the map and the HUD hangs off the viewport.
 *
 * Clicks are swallowed by the backdrop on purpose: the player reads the four
 * steps, then gets the map. "Passer" and Escape both end it immediately.
 */
export function TutorialOverlay({
	onDone,
	compact = false,
	menuOpen = false,
	onNeedMenu,
}: {
	onDone: () => void
	/** Touch layout: two extra steps, and the HUD lives behind the menu button. */
	compact?: boolean
	/** Whether the touch drawer is out, so a step pointing inside it can be measured. */
	menuOpen?: boolean
	/** Ask the scene to open or close the drawer for the step being shown. */
	onNeedMenu?: (open: boolean) => void
}) {
	const [index, setIndex] = useState(0)
	const [box, setBox] = useState<Box | null>(null)
	const [host, setHost] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
	const root = useRef<HTMLDivElement>(null)

	const steps = compact ? [...TOUCH_STEPS, ...STEPS] : STEPS
	// Clamped rather than reset: a rotation that swaps the layout mid-tour
	// shortens the list, and dropping the player back to step one would be worse.
	const step = steps[Math.min(index, steps.length - 1)]
	const last = index >= steps.length - 1

	useEscapeToClose(onDone)

	// A step that points at a row of the drawer needs the drawer out. The scene
	// owns that state, because the player opens it too.
	const needsMenu = compact && IN_MENU.includes(step.target)
	useEffect(() => {
		onNeedMenu?.(needsMenu)
	}, [needsMenu, onNeedMenu])

	useLayoutEffect(() => {
		const measure = () => {
			const container = root.current
			if (!container) return

			const frame = container.getBoundingClientRect()
			setHost({ width: frame.width, height: frame.height })

			const node = container.ownerDocument.querySelector(`[data-tutorial="${step.target}"]`)
			if (!node) {
				setBox(null)
				return
			}

			const rect = node.getBoundingClientRect()
			setBox({
				left: rect.left - frame.left,
				top: rect.top - frame.top,
				width: rect.width,
				height: rect.height,
			})
		}

		measure()
		// Once more on the next frame: the minimap canvas is sized from the map,
		// which can land after this effect has already run.
		const frame = requestAnimationFrame(measure)
		window.addEventListener('resize', measure)

		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener('resize', measure)
		}
		// `menuOpen` counts: a row of the drawer has no box until it has slid in.
	}, [step.target, menuOpen])

	// The card goes below the target when the target sits in the upper half and
	// above it otherwise, so it never covers what the arrow points at.
	const anchorX = box ? box.left + box.width / 2 : host.width / 2
	const under = box ? box.top + box.height / 2 < host.height / 2 : true
	// A 320px card on a 360px screen leaves no margin either side; shrink it
	// instead of letting it hang off the edge.
	const card = host.width > 0 ? Math.min(CARD, host.width - MARGIN * 2) : CARD
	const cardLeft = clamp(anchorX - card / 2, MARGIN, Math.max(MARGIN, host.width - card - MARGIN))

	/** `distance` pixels away from the target, on whichever side the card is on. */
	const place = (distance: number) =>
		box
			? under
				? { top: box.top + box.height + distance }
				: { bottom: Math.max(0, host.height - box.top) + distance }
			: { top: Math.max(MARGIN, host.height / 2 - 90) }

	/**
	 * What is left for the card once it has been placed.
	 *
	 * On a short screen — a phone held sideways, a small window — the step can
	 * be taller than the room between the target and the edge. Capping it there
	 * lets the text scroll inside the card instead of sliding off the top, which
	 * is where the buttons that advance the tutorial live.
	 */
	const room = (spot: { top?: number; bottom?: number }) => {
		if (host.height === 0) return undefined
		const used = spot.top ?? spot.bottom ?? 0
		return Math.max(120, host.height - used - MARGIN)
	}

	return (
		<div
			ref={root}
			role="dialog"
			aria-label="Bienvenue"
			aria-modal="true"
			className="absolute inset-0 z-40 overflow-hidden"
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
		>
			{/* The dim: a ring around the target whose shadow fills the rest of the
			    screen, so the highlight is a hole and not a second layer. */}
			{box ? (
				<div
					className="pointer-events-auto absolute rounded-xl ring-2 ring-emerald-300/90 transition-all duration-300"
					style={{
						left: box.left - PAD,
						top: box.top - PAD,
						width: box.width + PAD * 2,
						height: box.height + PAD * 2,
						boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.66)',
					}}
				/>
			) : (
				<div className="pointer-events-auto absolute inset-0 bg-black/60" />
			)}

			{box && (
				<div className="pointer-events-none absolute" style={{ left: anchorX - 12, ...place(6) }}>
					<Arrow up={!under} />
				</div>
			)}

			<div
				className="pointer-events-auto absolute overflow-y-auto rounded-xl border border-emerald-400/40 bg-[#141c17]/95 p-4 text-slate-100 shadow-2xl transition-all duration-300"
				style={{ left: cardLeft, width: card, maxHeight: room(place(GAP)), ...place(GAP) }}
			>
				<p className="text-xs font-medium uppercase tracking-wide text-emerald-300">
					Étape {index + 1} / {steps.length}
				</p>
				<h2 className="mt-1 text-lg font-semibold">{step.title}</h2>
				<p className="mt-1.5 text-base text-slate-300">{step.body}</p>

				<div className="mt-4 flex items-center gap-2">
					<div className="flex flex-1 items-center gap-1.5" aria-hidden="true">
						{steps.map((other, position) => (
							<span
								key={other.target}
								className={`h-1.5 rounded-full transition-all ${
									position === index ? 'w-5 bg-emerald-400' : 'w-1.5 bg-white/25'
								}`}
							/>
						))}
					</div>

					{!last && (
						<button
							type="button"
							onClick={onDone}
							className="rounded-md px-3 py-2 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white"
						>
							Passer
						</button>
					)}
					{index > 0 && (
						<button
							type="button"
							onClick={() => setIndex(index - 1)}
							className="rounded-md border border-white/15 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10"
						>
							Retour
						</button>
					)}
					{/* Autofocus takes the keyboard off the map for the duration, so
					    the character cannot walk out from under the arrow. */}
					<button
						type="button"
						autoFocus
						onClick={() => (last ? onDone() : setIndex(index + 1))}
						className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
					>
						{last ? 'C’est parti !' : 'Suivant'}
					</button>
				</div>
			</div>
		</div>
	)
}
