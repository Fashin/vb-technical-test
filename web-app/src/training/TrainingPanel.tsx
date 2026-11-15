import { useCallback, useEffect, useState } from 'react'
import { GiArrowDunk, GiBarracksTent, GiLevelEndFlag } from 'react-icons/gi'

import { BattleField, sideWithPlaybackHp, useBattlePlayback, type Battle } from '../battle'
import { spriteUrlFor } from '../map'
import { LevelBadge, XpBar } from '../progression'
import { useEscapeToClose } from '../ui'
import * as api from './api'
import type { Camp, TrainingSession } from './api'

/**
 * A training camp.
 *
 * Walking onto a camp opens this; pressing the button runs one session. The
 * session is a real fight — resolved by the same engine as the arena, animated
 * by the same component — against three wild Pokémon kept at the trainee's own
 * level. What it pays is decided by the server, and capped by the camp's
 * ceiling, which is what pushes the player towards the next biome.
 */

/** Breathing room between two chained sessions, so the payout can be read. */
const CHAIN_PAUSE = 1400

function Band({ camp }: { camp: Camp }) {
	return (
		<span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-200">
			Niveaux {camp.minLevel} – {camp.maxLevel}
		</span>
	)
}

/**
 * What each fighter took from the session, level-ups called out.
 *
 * Only Pokémon that actually fought are in `gains`, so this list doubles as
 * the answer to "who earned anything" — the bench is simply absent.
 */
function Gains({ session }: { session: TrainingSession }) {
	if (session.gains.length === 0) {
		return (
			<p className="mt-3 rounded-md bg-black/25 px-3 py-2 text-base text-slate-400">
				Aucun Pokémon sauvage mis K.O. : personne ne gagne d’expérience cette fois.
			</p>
		)
	}

	return (
		<ul className="mt-3 space-y-2">
			{session.gains.map((gain) => {
				const levelled = gain.after.level > gain.before.level
				const capped = gain.gained === 0
				return (
					<li key={gain.cardId} className="flex items-center gap-3 rounded-md bg-black/25 px-3 py-2">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="truncate text-base font-medium capitalize">{gain.name}</span>
								<LevelBadge level={gain.after.level} />
								{levelled && (
									<span className="flex items-center gap-1 text-xs font-medium text-emerald-300">
										<GiLevelEndFlag className="h-4 w-4" />
										+{gain.after.level - gain.before.level}
									</span>
								)}
							</div>
							<XpBar ratio={gain.after.ratio} toNextLevel={gain.after.toNextLevel} className="mt-1.5" />
						</div>
						<span className={`shrink-0 text-sm tabular-nums ${capped ? 'text-slate-500' : 'text-sky-300'}`}>
							{capped ? 'plafond atteint' : `+${gain.gained} XP`}
						</span>
					</li>
				)
			})}
		</ul>
	)
}

export function TrainingPanel({ campId, onClose }: { campId: string; onClose: () => void }) {
	const [camps, setCamps] = useState<Camp[] | null>(null)
	const [session, setSession] = useState<TrainingSession | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	/** Keep training without being asked, until something needs a decision. */
	const [chaining, setChaining] = useState(false)

	// The fight is a Battle, so it plays through the arena's own player.
	const [battle, setBattle] = useState<Battle | null>(null)
	const { view, play } = useBattlePlayback(battle)
	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

	useEscapeToClose(onClose)

	useEffect(() => {
		let cancelled = false
		api
			.fetchCamps()
			.then(({ camps: found }) => !cancelled && setCamps(found))
			.catch(() => !cancelled && setCamps([]))
		return () => {
			cancelled = true
		}
	}, [])

	const camp = camps?.find((entry) => entry.id === campId) ?? null

	const train = useCallback(async () => {
		setBusy(true)
		setError(null)
		try {
			const result = await api.trainAt(campId)
			setSession(result)
			setBattle(result.battle)
			play(result.battle, reducedMotion)
			// The team levelled up, so the camp's own verdict has changed too.
			api.fetchCamps().then(({ camps: found }) => setCamps(found)).catch(() => undefined)
		} catch (cause) {
			setError(cause instanceof api.TrainingError ? cause.message : 'Serveur injoignable')
		} finally {
			setBusy(false)
		}
	}, [campId, play, reducedMotion])

	/**
	 * Chaining: start the next session on its own once the last one has played.
	 *
	 * It waits for the fight to finish rather than firing on the response, so
	 * the chain never cuts an animation short — the sessions are not skippable
	 * either way. Anything that would need a decision stops it: an error, a
	 * camp that has nothing left to teach, or one the team cannot enter.
	 */
	useEffect(() => {
		if (!chaining || busy || view.playing || error) return
		if (!camp || !camp.unlocked || camp.exhausted) return

		const timer = setTimeout(() => void train(), CHAIN_PAUSE)
		return () => clearTimeout(timer)
	}, [chaining, busy, view.playing, error, camp, train])

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
			<section
				role="dialog"
				aria-label={camp ? `Camp d’entraînement ${camp.name}` : 'Camp d’entraînement'}
				className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2 className="flex items-center gap-2 text-xl font-semibold">
							<GiBarracksTent className="h-6 w-6 text-sky-300" />
							{camp?.name ?? 'Camp d’entraînement'}
						</h2>
						{camp && (
							<div className="mt-1 flex flex-wrap items-center gap-2">
								<span className="text-base text-slate-400">{camp.title}</span>
								<Band camp={camp} />
								{/* The camp picks its own trainee, so say who walks in next. */}
								<span className="text-xs text-slate-500">
									{camp.nextTrainee
										? `au tour de ${camp.nextTrainee.name} (niveau ${camp.nextTrainee.level})`
										: `ton équipe : niveau ${camp.teamLevel}`}
								</span>
							</div>
						)}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				{camps === null ? (
					<p className="py-10 text-center text-base text-slate-500">Chargement…</p>
				) : !camp ? (
					<p className="py-10 text-center text-base text-slate-500">Ce camp n’existe pas.</p>
				) : (
					<>
						<p className="mt-3 text-base italic text-slate-400">« {camp.blurb} »</p>

						{/* Who spars here, so the band is something you can see. */}
						<ul className="mt-3 flex flex-wrap gap-1" aria-label="Pokémon sauvages du camp">
							{camp.wild.map((pokedexId) => (
								<li key={pokedexId}>
									<img
										src={spriteUrlFor(pokedexId)}
										alt=""
										loading="lazy"
										className="h-10 w-10 [image-rendering:pixelated] opacity-80"
									/>
								</li>
							))}
						</ul>

						{!camp.unlocked && (
							<p className="mt-3 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
								Ce camp n’accepte qu’à partir du niveau {camp.minLevel}. Entraîne-toi dans un camp plus bas
								d’abord.
							</p>
						)}
						{camp.unlocked && camp.allInCare && (
							<p className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-200">
								Tes Pokémon de ce palier sont blessés ou en soins. Passe par le centre de soins, au
								carrefour du spawn.
							</p>
						)}
						{camp.unlocked && camp.exhausted && (
							<p className="mt-3 flex items-center gap-2 rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
								<GiArrowDunk className="h-5 w-5 shrink-0" />
								Plus personne de ton équipe n’est dans la tranche {camp.minLevel}–{camp.maxLevel} : ce
								camp n’a plus rien à t’apprendre. Le palier suivant est ailleurs sur la carte.
							</p>
						)}

						{error && (
							<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
								{error}
							</p>
						)}

						{battle && (
							<div className="mt-4">
								<BattleField
									player={sideWithPlaybackHp(battle.player, view.playerHp, view.playerActive)}
									master={sideWithPlaybackHp(battle.master, view.masterHp, view.masterActive)}
									view={view}
								/>
							</div>
						)}

						{/* The payout waits for the fight to finish playing. */}
						<div className="min-h-0 flex-1 overflow-y-auto">
							{session && !view.playing && (
								<>
									<p className="mt-4 text-base">
										{session.battle.status === 'won' ? 'Session réussie' : 'Session perdue'} —{' '}
										<span className="font-semibold text-sky-300">+{session.xpEarned} XP</span> distribués
									</p>
									<p className="text-sm text-slate-500">
										Seuls les Pokémon qui sont entrés sur le terrain gagnent de l’expérience, à parts
										égales. Le banc ne gagne rien.
									</p>
									<Gains session={session} />
								</>
							)}
						</div>

						<div className="mt-4 shrink-0">
							{view.playing ? (
								/* Deliberately not skippable: watching the session through is the point. */
								<p className="w-full rounded-md border border-white/10 bg-black/30 px-4 py-3 text-center font-medium text-slate-400">
									Entraînement en cours…
								</p>
							) : (
								<button
									type="button"
									onClick={() => void train()}
									disabled={busy || !camp.unlocked || camp.exhausted}
									className="w-full rounded-md bg-sky-500 px-4 py-3 font-semibold text-sky-950 transition hover:bg-sky-400 disabled:opacity-40"
								>
									{busy
										? 'Entraînement en cours…'
										: chaining
											? 'Session suivante…'
											: session
												? 'Nouvelle session'
												: 'S’entraîner'}
								</button>
							)}

							<label className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-slate-300">
								<input
									type="checkbox"
									checked={chaining}
									onChange={(event) => setChaining(event.target.checked)}
									disabled={!camp.unlocked || camp.exhausted}
									className="h-4 w-4 accent-sky-500 disabled:opacity-40"
								/>
								Enchaîner les sessions automatiquement
							</label>
						</div>
					</>
				)}
			</section>
		</div>
	)
}
