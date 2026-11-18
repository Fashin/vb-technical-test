import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GiAura, GiQueenCrown, GiScissors, GiTrophyCup } from 'react-icons/gi'

import { fetchMasters, type Master } from '../arena'
import { Breadcrumb, useEscapeToClose } from '../ui'
import { useAuth } from '../auth'
import {
	AURA_BETA,
	AURA_COLORS,
	AURA_MASTER,
	AURA_REQUIREMENTS,
	AURA_STYLES,
	CROWN_COLORS,
	CROWN_REQUIREMENTS,
	CROWN_STYLES,
	PIN_COLORS,
	BOTTOMS,
	BUILDS,
	CLOTH_COLORS,
	FACIAL_HAIR,
	HAIR_COLORS,
	HAIR_STYLES,
	HAT_STYLES,
	SKIN_TONES,
	TrainerPortrait,
	appearanceKey,
	type Appearance,
} from '../trainer'

interface SwatchesProps {
	label: string
	colors: string[]
	value: number
	onChange: (index: number) => void
}

function Swatches({ label, colors, value, onChange }: SwatchesProps) {
	return (
		<div>
			<p className="text-sm text-slate-400">{label}</p>
			<div className="mt-1 flex flex-wrap gap-1.5">
				{colors.map((color, index) => (
					<button
						key={color}
						type="button"
						onClick={() => onChange(index)}
						aria-label={label + ' ' + (index + 1)}
						aria-pressed={value === index}
						style={{ backgroundColor: color }}
						className={
							'h-7 w-7 rounded-md border-2 transition ' +
							(value === index ? 'border-white' : 'border-white/15 hover:border-white/50')
						}
					/>
				))}
			</div>
		</div>
	)
}

interface ChoicesProps {
	label: string
	options: readonly string[]
	value: number
	onChange: (index: number) => void
	/**
	 * Options this account has not earned. They stay in the list, greyed and
	 * disabled with `title` saying what unlocks them — the same treatment the
	 * badge pins get below, and for the same reason: a locked row is how a
	 * player finds out the reward exists.
	 */
	locked?: Record<number, string>
	/** Marks drawn before an option's label, by index. */
	adornments?: Record<number, ReactNode>
}

function Choices({ label, options, value, onChange, locked, adornments }: ChoicesProps) {
	return (
		<div>
			<p className="text-sm text-slate-400">{label}</p>
			<div className="mt-1 flex flex-wrap gap-1.5">
				{options.map((option, index) => {
					const reason = locked?.[index]
					return (
						<button
							key={option}
							type="button"
							disabled={reason !== undefined}
							title={reason}
							onClick={() => onChange(index)}
							aria-pressed={value === index}
							className={
								'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition disabled:cursor-not-allowed ' +
								(reason !== undefined
									? 'bg-white/5 text-slate-600'
									: value === index
										? 'bg-white/20 text-white'
										: 'bg-white/5 text-slate-300 hover:bg-white/10')
							}
						>
							{adornments?.[index]}
							{option}
						</button>
					)
				})}
			</div>
		</div>
	)
}

/**
 * The badge pins, earned ones first.
 *
 * Every master is listed, won or not: the locked rows are the point as much as
 * the unlocked ones — this is where a player finds out that beating Cendre is
 * what gets them the orange pin. The colour alone never carries it, so each
 * row is named and the locked ones say so in words.
 */
function Pins({
	masters,
	value,
	onChange,
}: {
	masters: Master[]
	value: number
	onChange: (pin: number) => void
}) {
	return (
		<div>
			<p className="flex items-center gap-1.5 text-sm text-slate-400">
				<GiTrophyCup className="h-4 w-4 text-amber-300" />
				Badge d’arène
			</p>

			<div className="mt-1 flex flex-wrap gap-1.5">
				<button
					type="button"
					onClick={() => onChange(0)}
					aria-pressed={value === 0}
					className={
						'rounded-md px-2 py-1 text-sm transition ' +
						(value === 0 ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10')
					}
				>
					Aucun
				</button>

				{masters.map((master) => {
					const locked = !master.defeated
					return (
						<button
							key={master.id}
							type="button"
							disabled={locked}
							onClick={() => onChange(master.badge.pin)}
							aria-pressed={value === master.badge.pin}
							title={
								locked
									? `${master.badge.name} — à gagner contre ${master.name}`
									: `${master.badge.name} — ${master.name} vaincu`
							}
							className={
								'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition disabled:cursor-not-allowed ' +
								(locked
									? 'bg-white/5 text-slate-600'
									: value === master.badge.pin
										? 'bg-white/20 text-white'
										: 'bg-white/5 text-slate-300 hover:bg-white/10')
							}
						>
							<span
								aria-hidden
								className="h-3 w-3 rounded-full border border-black/40"
								style={{
									background: locked ? 'transparent' : PIN_COLORS[master.badge.pin],
									borderStyle: locked ? 'dashed' : 'solid',
								}}
							/>
							{master.badge.name.replace('Badge ', '')}
						</button>
					)
				})}
			</div>

			{masters.length > 0 && masters.every((master) => !master.defeated) && (
				<p className="mt-1 text-xs text-slate-500">
					Aucun badge pour l’instant — ils se gagnent à l’arène, et chacun ouvre aussi le camp
					d’entraînement suivant.
				</p>
			)}
		</div>
	)
}

/**
 * The auras: the two rewards worn by the character rather than by its clothes.
 *
 * Listed whether they are earned or not, like the pins, and for the same
 * reason — a locked row with the reason on it is how a player learns the
 * reward exists at all. The dot is the glow itself rather than an icon, so the
 * list says what the sprite will do.
 */
function Auras({
	value,
	locked,
	onChange,
}: {
	value: number
	/** Reasons, by aura index, for the ones this account has not earned. */
	locked: Record<number, string>
	onChange: (aura: number) => void
}) {
	return (
		<div>
			<p className="flex items-center gap-1.5 text-sm text-slate-400">
				<GiAura className="h-4 w-4 text-sky-300" />
				Aura
			</p>

			<div className="mt-1 flex flex-wrap gap-1.5">
				{AURA_STYLES.map((style, index) => {
					const reason = locked[index]
					const color = AURA_COLORS[index]
					return (
						<button
							key={style}
							type="button"
							disabled={reason !== undefined}
							title={reason}
							onClick={() => onChange(index)}
							aria-pressed={value === index}
							className={
								'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition disabled:cursor-not-allowed ' +
								(reason !== undefined
									? 'bg-white/5 text-slate-600'
									: value === index
										? 'bg-white/20 text-white'
										: 'bg-white/5 text-slate-300 hover:bg-white/10')
							}
						>
							{index > 0 && (
								<span
									aria-hidden
									className="h-3 w-3 rounded-full border border-black/40"
									style={{
										background: reason === undefined ? color : 'transparent',
										borderStyle: reason === undefined ? 'solid' : 'dashed',
										// The swatch glows the way the sprite will.
										boxShadow: reason === undefined ? `0 0 6px 1px ${color}` : undefined,
									}}
								/>
							)}
							{style}
						</button>
					)
				})}
			</div>

			{Object.keys(locked).length > 0 && (
				<p className="mt-1 text-xs text-slate-500">
					{Object.values(locked).join(' · ')}.
				</p>
			)}
		</div>
	)
}

/**
 * The podium crowns: the ranking's reward.
 *
 * Unlike every other row in this panel, the one that is open here can close
 * again — the crown belongs to a place in the standing, not to something the
 * account did once. So the locked rows do not say "to earn" but who holds
 * them, and the server clears a crown whose place has been lost rather than
 * leaving a stale one on the sprite.
 */
function Crowns({
	value,
	available,
	onChange,
}: {
	value: number
	/** The crown this account may wear right now, 0 for none. */
	available: number
	onChange: (crown: number) => void
}) {
	return (
		<div>
			<p className="flex items-center gap-1.5 text-sm text-slate-400">
				<GiQueenCrown className="h-4 w-4 text-amber-300" />
				Couronne du classement
			</p>

			<div className="mt-1 flex flex-wrap gap-1.5">
				{CROWN_STYLES.map((style, index) => {
					const locked = index !== 0 && index !== available
					const color = CROWN_COLORS[index]
					return (
						<button
							key={style}
							type="button"
							disabled={locked}
							title={locked ? CROWN_REQUIREMENTS[index] : undefined}
							onClick={() => onChange(index)}
							aria-pressed={value === index}
							className={
								'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition disabled:cursor-not-allowed ' +
								(locked
									? 'bg-white/5 text-slate-600'
									: value === index
										? 'bg-white/20 text-white'
										: 'bg-white/5 text-slate-300 hover:bg-white/10')
							}
						>
							{index > 0 && (
								<span
									aria-hidden
									className="h-3 w-3 rounded-sm border border-black/40"
									style={{
										background: locked ? 'transparent' : color,
										borderStyle: locked ? 'dashed' : 'solid',
									}}
								/>
							)}
							{style}
						</button>
					)
				})}
			</div>

			<p className="mt-1 text-xs text-slate-500">
				{available === 0
					? 'Le podium du classement les porte : l’or au premier, le fer au deuxième, le bronze au troisième.'
					: `${CROWN_REQUIREMENTS[available]} — elle se perd avec la place.`}
			</p>
		</div>
	)
}

interface BarberPanelProps {
	onClose: () => void
	/** Called with the saved look so the world can broadcast it. */
	onSaved: (appearance: Appearance) => void
}

/**
 * Character editor.
 *
 * Edits a local draft and only writes on save, so a player can try things on
 * without everyone else watching the flicker. The preview runs the same
 * drawing routine the world does, not an approximation of it — what is shown
 * here is literally the sprite that will walk around.
 */
export function BarberPanel({ onClose, onSaved }: BarberPanelProps) {
	const { user, restyle } = useAuth()
	const [draft, setDraft] = useState<Appearance>(() => ({ ...user!.appearance }))
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	/**
	 * The arena roster, for the pins. Fetched here rather than passed in: the
	 * barber is the only screen that needs to know which badges are won, and a
	 * failed lookup simply leaves the pin list empty rather than breaking the
	 * haircut.
	 */
	const [masters, setMasters] = useState<Master[]>([])
	const backdrop = useRef<HTMLDivElement>(null)

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

	useEffect(() => {
		let cancelled = false
		fetchMasters()
			.then(({ masters: found }) => !cancelled && setMasters(found))
			.catch(() => undefined)
		return () => {
			cancelled = true
		}
	}, [])

	/**
	 * Auras this account cannot wear yet, with what unlocks them.
	 *
	 * The gold one needs every master beaten, which is read off the roster the
	 * pins already use — and a roster that failed to load leaves it locked
	 * rather than open: the server refuses it either way, and a button that
	 * errors on save is worse than one that says why it is greyed.
	 */
	const lockedAuras: Record<number, string> = {}
	if (!user?.betaTester) lockedAuras[AURA_BETA] = AURA_REQUIREMENTS[AURA_BETA]
	if (masters.length === 0 || masters.some((master) => !master.defeated)) {
		lockedAuras[AURA_MASTER] = AURA_REQUIREMENTS[AURA_MASTER]
	}

	const dirty = user ? appearanceKey(draft) !== appearanceKey(user.appearance) : false
	const set = (patch: Partial<Appearance>) => setDraft((current) => ({ ...current, ...patch }))

	const save = async () => {
		setSaving(true)
		setError(null)
		try {
			await restyle(draft)
			onSaved(draft)
			onClose()
		} catch {
			setError('Impossible d’enregistrer pour le moment')
			setSaving(false)
		}
	}

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/55 p-4 outline-none"
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label="Coiffeur"
				className="my-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex shrink-0 items-center justify-between">
					<Breadcrumb
						trail={[
							{ label: 'Carte', onClick: onClose },
							{ label: 'Coiffeur' },
						]}
						icon={GiScissors}
						tone="text-emerald-300"
					/>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				<div className="mt-4 flex min-h-0 flex-1 gap-5 overflow-y-auto">
					<div className="flex shrink-0 flex-col items-center gap-2">
						<div className="rounded-lg border border-white/10 bg-gradient-to-b from-emerald-900/40 to-black/40 p-3">
							<TrainerPortrait appearance={draft} scale={8} label="Aperçu du dresseur" />
						</div>
						<span className="text-sm text-slate-500">{user?.displayName}</span>
					</div>

					<div className="flex flex-1 flex-col gap-3">
						<Choices
							label="Silhouette"
							options={BUILDS}
							value={draft.build}
							onChange={(build) => set({ build })}
						/>
						<Choices label="Coupe" options={HAIR_STYLES} value={draft.hair} onChange={(hair) => set({ hair })} />
						<Swatches
							label="Couleur de cheveux"
							colors={HAIR_COLORS}
							value={draft.hairColor}
							onChange={(hairColor) => set({ hairColor })}
						/>
						<Choices
							label="Pilosité faciale"
							options={FACIAL_HAIR}
							value={draft.facialHair}
							onChange={(facialHair) => set({ facialHair })}
						/>
						<Choices
							label="Couvre-chef"
							options={HAT_STYLES}
							value={draft.hat}
							onChange={(hat) => set({ hat })}
						/>
						<Swatches label="Carnation" colors={SKIN_TONES} value={draft.skin} onChange={(skin) => set({ skin })} />
						<Swatches label="Haut" colors={CLOTH_COLORS} value={draft.shirt} onChange={(shirt) => set({ shirt })} />
						<Choices
							label="Tenue du bas"
							options={BOTTOMS}
							value={draft.bottom}
							onChange={(bottom) => set({ bottom })}
						/>
						<Swatches
							label={draft.bottom === 1 ? 'Couleur de la jupe' : 'Couleur du pantalon'}
							colors={CLOTH_COLORS}
							value={draft.trousers}
							onChange={(trousers) => set({ trousers })}
						/>
						<Pins masters={masters} value={draft.pin} onChange={(pin) => set({ pin })} />
						<Auras value={draft.aura} locked={lockedAuras} onChange={(aura) => set({ aura })} />
						<Crowns
							value={draft.crown}
							available={user?.podiumCrown ?? 0}
							onChange={(crown) => set({ crown })}
						/>
					</div>
				</div>

				{error && (
					<p role="alert" className="mt-3 shrink-0 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				<div className="mt-4 flex shrink-0 gap-2">
					<button
						type="button"
						onClick={() => user && setDraft({ ...user.appearance })}
						disabled={!dirty || saving}
						className="rounded-md border border-white/15 px-3 py-2 text-base text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
					>
						Annuler les retouches
					</button>
					<button
						type="button"
						onClick={() => void save()}
						disabled={!dirty || saving}
						className="flex-1 rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
					>
						{saving ? 'Enregistrement…' : 'Valider la coupe'}
					</button>
				</div>
			</section>
		</div>
	)
}
