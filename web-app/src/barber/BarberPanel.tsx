import { useEffect, useRef, useState } from 'react'
import { GiScissors } from 'react-icons/gi'

import { useEscapeToClose } from '../ui'
import { useAuth } from '../auth'
import {
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
}

function Choices({ label, options, value, onChange }: ChoicesProps) {
	return (
		<div>
			<p className="text-sm text-slate-400">{label}</p>
			<div className="mt-1 flex flex-wrap gap-1.5">
				{options.map((option, index) => (
					<button
						key={option}
						type="button"
						onClick={() => onChange(index)}
						aria-pressed={value === index}
						className={
							'rounded-md px-2 py-1 text-sm transition ' +
							(value === index ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10')
						}
					>
						{option}
					</button>
				))}
			</div>
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
	const backdrop = useRef<HTMLDivElement>(null)

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

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
			className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 outline-none"
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label="Coiffeur"
				className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<h2 className="flex items-center gap-2 text-xl font-semibold">
						<GiScissors className="h-6 w-6 text-emerald-300" />
						Coiffeur
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				<div className="mt-4 flex flex-1 gap-5 overflow-y-auto">
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
					</div>
				</div>

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				<div className="mt-4 flex gap-2">
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
