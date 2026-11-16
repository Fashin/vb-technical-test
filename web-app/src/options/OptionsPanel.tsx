import { useEffect, useRef, useState, type FormEvent } from 'react'
import { GiCog } from 'react-icons/gi'

import { Breadcrumb, Toggle, useEscapeToClose } from '../ui'
import { setSoundEnabled, soundEnabled } from '../audio'
import { AuthError, useAuth } from '../auth'

const PASSWORD_MIN = 8

function Field({
	label,
	value,
	onChange,
	autoComplete,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	autoComplete: string
}) {
	return (
		<label className="block text-base">
			<span className="text-slate-300">{label}</span>
			<input
				type="password"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				autoComplete={autoComplete}
				required
				className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-emerald-400"
			/>
		</label>
	)
}

const NAME_MAX = 24

function NameSection({ onRenamed }: { onRenamed: (name: string) => void }) {
	const { user, rename } = useAuth()
	const [name, setName] = useState(user?.displayName ?? '')
	const [error, setError] = useState<string | null>(null)
	const [done, setDone] = useState(false)
	const [saving, setSaving] = useState(false)

	const trimmed = name.trim()
	const dirty = trimmed.length > 0 && trimmed !== user?.displayName

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		setError(null)
		setDone(false)
		setSaving(true)
		try {
			await rename(trimmed)
			// Other players are looking at the old label right now.
			onRenamed(trimmed)
			setDone(true)
		} catch (cause) {
			setError(cause instanceof AuthError ? cause.message : 'Serveur injoignable')
		} finally {
			setSaving(false)
		}
	}

	return (
		<form onSubmit={submit} className="rounded-lg border border-white/10 bg-black/25 p-4">
			<h3 className="text-base font-semibold">Changer de pseudo</h3>
			<p className="mt-1 text-sm text-slate-500">
				C’est le nom affiché au-dessus de ton dresseur, pour les autres joueurs.
			</p>

			<label className="mt-3 block text-base">
				<span className="text-slate-300">Pseudo</span>
				<input
					value={name}
					onChange={(event) => {
						setName(event.target.value)
						setDone(false)
					}}
					maxLength={NAME_MAX}
					required
					className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-emerald-400"
				/>
				<span className="mt-1 block text-sm text-slate-500">{NAME_MAX} caractères maximum</span>
			</label>

			{error && (
				<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
					{error}
				</p>
			)}
			{done && (
				<p role="status" className="mt-3 rounded-md bg-emerald-500/15 px-3 py-2 text-base text-emerald-300">
					Pseudo mis à jour.
				</p>
			)}

			<button
				type="submit"
				disabled={saving || !dirty}
				className="mt-4 w-full rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
			>
				{saving ? 'Enregistrement…' : 'Renommer'}
			</button>
		</form>
	)
}

function PasswordSection() {
	const { changePassword } = useAuth()
	const [current, setCurrent] = useState('')
	const [next, setNext] = useState('')
	const [confirm, setConfirm] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [done, setDone] = useState(false)
	const [saving, setSaving] = useState(false)

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		setError(null)
		setDone(false)

		// Caught here rather than server-side: the confirmation field only
		// exists in this form, so the server has nothing to compare it against.
		if (next !== confirm) {
			setError('Les deux nouveaux mots de passe ne correspondent pas')
			return
		}

		setSaving(true)
		try {
			await changePassword(current, next)
			setCurrent('')
			setNext('')
			setConfirm('')
			setDone(true)
		} catch (cause) {
			setError(cause instanceof AuthError ? cause.message : 'Serveur injoignable')
		} finally {
			setSaving(false)
		}
	}

	return (
		<form onSubmit={submit} className="rounded-lg border border-white/10 bg-black/25 p-4">
			<h3 className="text-base font-semibold">Changer de mot de passe</h3>
			<p className="mt-1 text-sm text-slate-500">
				Tes autres sessions seront déconnectées. Celle-ci reste ouverte.
			</p>

			<div className="mt-3 space-y-3">
				<Field
					label="Mot de passe actuel"
					value={current}
					onChange={setCurrent}
					autoComplete="current-password"
				/>
				<Field label="Nouveau mot de passe" value={next} onChange={setNext} autoComplete="new-password" />
				<Field label="Confirmer" value={confirm} onChange={setConfirm} autoComplete="new-password" />
			</div>

			{error && (
				<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
					{error}
				</p>
			)}
			{done && (
				<p role="status" className="mt-3 rounded-md bg-emerald-500/15 px-3 py-2 text-base text-emerald-300">
					Mot de passe mis à jour.
				</p>
			)}

			<button
				type="submit"
				disabled={saving || current.length === 0 || next.length < PASSWORD_MIN}
				className="mt-4 w-full rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
			>
				{saving ? 'Enregistrement…' : 'Mettre à jour'}
			</button>
		</form>
	)
}

function DangerSection() {
	const { deleteAccount } = useAuth()
	const [armed, setArmed] = useState(false)
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		setError(null)
		setDeleting(true)
		try {
			// On success the provider flips to "anonymous" and this whole panel
			// unmounts with the map, so there is nothing to clean up here.
			await deleteAccount(password)
		} catch (cause) {
			setError(cause instanceof AuthError ? cause.message : 'Serveur injoignable')
			setDeleting(false)
		}
	}

	return (
		<section className="rounded-lg border border-red-500/30 bg-red-950/20 p-4">
			<h3 className="text-base font-semibold text-red-200">Supprimer mon compte</h3>
			<p className="mt-1 text-sm text-red-300/80">
				Ton dresseur, tes cartes et tes boosters sont effacés définitivement. Cette action est
				irréversible.
			</p>

			{!armed ? (
				<button
					type="button"
					onClick={() => setArmed(true)}
					className="mt-3 w-full rounded-md border border-red-500/50 px-4 py-2 text-base text-red-200 transition hover:bg-red-500/15"
				>
					Supprimer mon compte…
				</button>
			) : (
				<form onSubmit={submit} className="mt-3">
					<Field
						label="Saisis ton mot de passe pour confirmer"
						value={password}
						onChange={setPassword}
						autoComplete="current-password"
					/>

					{error && (
						<p role="alert" className="mt-3 rounded-md bg-red-500/20 px-3 py-2 text-base text-red-200">
							{error}
						</p>
					)}

					<div className="mt-3 flex gap-2">
						<button
							type="button"
							onClick={() => {
								setArmed(false)
								setPassword('')
								setError(null)
							}}
							disabled={deleting}
							className="flex-1 rounded-md border border-white/15 px-3 py-2 text-base text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
						>
							Annuler
						</button>
						<button
							type="submit"
							disabled={deleting || password.length === 0}
							className="flex-1 rounded-md bg-red-600 px-3 py-2 text-base font-medium text-white transition hover:bg-red-500 disabled:opacity-40"
						>
							{deleting ? 'Suppression…' : 'Supprimer définitivement'}
						</button>
					</div>
				</form>
			)}
		</section>
	)
}

/**
 * The sound switch.
 *
 * Read from storage on mount rather than held in a context: the only thing
 * that needs the answer is `playHealJingle`, and it asks at the moment it is
 * about to play, so there is no shared state to keep in step.
 */
function SoundSection() {
	const [enabled, setEnabled] = useState(() => soundEnabled())

	return (
		<section className="rounded-lg border border-white/10 bg-black/25 p-4">
			<h3 className="text-base font-semibold">Son</h3>
			<div className="mt-3">
				<Toggle
					checked={enabled}
					onChange={(next) => {
						setEnabled(next)
						setSoundEnabled(next)
					}}
					label="Effets sonores"
					hint="Le jingle du centre de soins quand tu confies ton équipe."
				/>
			</div>
		</section>
	)
}

/**
 * Account settings.
 *
 * Both actions ask for the password again even though the player is already
 * signed in: being authenticated proves the session is valid, not that the
 * person at the keyboard is the account's owner. Deletion additionally takes
 * two deliberate steps, because nothing about it can be undone.
 */
export function OptionsPanel({
	onClose,
	onRenamed,
	onReplayTutorial,
}: {
	onClose: () => void
	/** Called with the new pseudonym so the world can refresh the labels. */
	onRenamed: (name: string) => void
	/** Play the welcome tour again. Omitted when there is no tour to play. */
	onReplayTutorial?: () => void
}) {
	const { user } = useAuth()
	const backdrop = useRef<HTMLDivElement>(null)

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

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
				aria-label="Options"
				className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<Breadcrumb
						trail={[
							{ label: 'Carte', onClick: onClose },
							{ label: 'Options' },
						]}
						icon={GiCog}
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

				<p className="mt-1 text-base text-slate-400">
					{user?.displayName} · {user?.email}
				</p>

				<div className="mt-4 flex-1 space-y-4 overflow-y-auto">
					{onReplayTutorial && (
						<section className="rounded-lg border border-white/10 bg-black/25 p-4">
							<h3 className="text-base font-semibold">Revoir le tutoriel</h3>
							<p className="mt-1 text-sm text-slate-500">
								Les quatre étapes de départ : boosters, entraînement, soins et arène.
							</p>
							<button
								type="button"
								onClick={onReplayTutorial}
								className="mt-3 w-full rounded-md border border-emerald-400/40 px-4 py-2 text-base text-emerald-200 transition hover:bg-emerald-500/15"
							>
								Relancer le tutoriel
							</button>
						</section>
					)}
					<SoundSection />
					<NameSection onRenamed={onRenamed} />
					<PasswordSection />
					<DangerSection />
				</div>
			</section>
		</div>
	)
}
