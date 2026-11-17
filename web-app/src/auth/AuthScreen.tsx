import { useState, type FormEvent } from 'react'

import { AuthError } from './api'
import { useAuth } from './AuthContext'

type Mode = 'login' | 'register'

/** Full-screen sign-in, shown only when no valid session was restored. */
export function AuthScreen() {
	const { login, register } = useAuth()
	const [mode, setMode] = useState<Mode>('login')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [displayName, setDisplayName] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		setError(null)
		setPending(true)
		try {
			if (mode === 'login') await login(email, password)
			else await register(email, password, displayName)
		} catch (cause) {
			setError(cause instanceof AuthError ? cause.message : 'Serveur injoignable')
			setPending(false)
		}
	}

	return (
		<div className="flex h-full w-full items-start justify-center overflow-y-auto bg-[#121a12] p-4 text-slate-100">
			<form
				onSubmit={submit}
				className="my-auto w-full max-w-md rounded-xl border border-white/10 bg-black/30 p-6 shadow-2xl"
			>
				<h1 className="text-2xl font-semibold">
					{mode === 'login' ? 'Reprendre la partie' : 'Créer un dresseur'}
				</h1>
				<p className="mt-1 text-base text-slate-400">
					{mode === 'login'
						? 'Ton personnage réapparaît là où tu t’es arrêté.'
						: 'Un compte, un Pokémon, et tu rejoins les autres sur la carte.'}
				</p>

				<label className="mt-5 block text-base">
					<span className="text-slate-300">Email</span>
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						autoComplete="email"
						required
						className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-emerald-400"
					/>
				</label>

				{mode === 'register' && (
					<label className="mt-3 block text-base">
						<span className="text-slate-300">Pseudo</span>
						<input
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							maxLength={24}
							required
							className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-emerald-400"
						/>
					</label>
				)}

				<label className="mt-3 block text-base">
					<span className="text-slate-300">Mot de passe</span>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
						minLength={8}
						required
						className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-emerald-400"
					/>
					{mode === 'register' && <span className="mt-1 block text-sm text-slate-500">8 caractères minimum</span>}
				</label>

				{error && (
					<p role="alert" className="mt-4 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				<button
					type="submit"
					disabled={pending}
					className="mt-5 w-full rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
				>
					{pending ? '…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
				</button>

				<button
					type="button"
					onClick={() => {
						setMode(mode === 'login' ? 'register' : 'login')
						setError(null)
					}}
					className="mt-3 w-full text-base text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
				>
					{mode === 'login' ? 'Pas encore de compte ? En créer un' : 'J’ai déjà un compte'}
				</button>
			</form>
		</div>
	)
}
