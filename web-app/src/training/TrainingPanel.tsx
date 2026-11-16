import { useCallback, useEffect, useState } from 'react'
import { GiArrowDunk, GiBarracksTent, GiLevelEndFlag } from 'react-icons/gi'

import { BattleField, sideWithPlaybackHp, useBattlePlayback, type Battle } from '../battle'
import { spriteUrlFor } from '../map'
import { LevelBadge, XpBar } from '../progression'
import { fetchTeams, type Team } from '../teams'
import { Breadcrumb, readFlag, Toggle, useEscapeToClose, writeFlag } from '../ui'
import * as api from './api'
import type { Camp, TrainingSession } from './api'

/**
 * A training camp.
 *
 * Walking onto a camp opens this; pressing the button runs one session. The
 * session is a real fight — resolved by the same engine as the arena, animated
 * by the same component — where the whole team spars, one wild partner each,
 * kept at the opening trainee's own level. Which team walks in is picked here;
 * what the session pays is decided by the server, and capped by the camp's
 * ceiling, which is what pushes the player towards the next biome.
 */

/**
 * The chaining switch is remembered in this browser.
 *
 * A player who wants their sessions to run on their own wants that at every
 * camp and on every visit — having to tick the box again each time is the kind
 * of friction the switch exists to remove. It stays local rather than on the
 * account because it describes how this person likes to watch the game, not
 * anything the server has to know.
 */
const CHAIN_KEY = 'pokemon:training:chaining'

/** Breathing room between two chained sessions, so the payout can be read. */
const CHAIN_PAUSE = 1400

/**
 * Which team walks into the camp.
 *
 * A row of buttons rather than a `<select>`: there are at most six teams, the
 * healthy count matters as much as the name, and a team with nobody fit to
 * fight should be visibly unpickable rather than silently chosen.
 */
function TeamPicker({
	teams,
	selected,
	activeTeamId,
	onSelect,
	disabled,
}: {
	teams: Team[]
	selected: string | null
	activeTeamId: string | null
	onSelect: (teamId: string) => void
	disabled: boolean
}) {
	if (teams.length === 0) {
		return (
			<p className="mt-3 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
				Tu n’as pas encore composé d’équipe. Passe par « Mon équipe » avant de t’entraîner.
			</p>
		)
	}

	return (
		<div className="mt-3">
			<p className="text-xs font-medium uppercase tracking-wide text-slate-500">
				Équipe envoyée au camp
			</p>
			<ul className="mt-1.5 flex flex-wrap gap-2" aria-label="Choix de l’équipe">
				{teams.map((team) => {
					const fit = team.members.filter((member) => !member.inCare && !member.fainted).length
					const chosen = team.id === selected
					return (
						<li key={team.id}>
							<button
								type="button"
								onClick={() => onSelect(team.id)}
								disabled={disabled || fit === 0}
								aria-pressed={chosen}
								className={`rounded-md border px-3 py-1.5 text-left text-sm transition disabled:opacity-40 ${
									chosen
										? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
										: 'border-white/10 bg-black/25 text-slate-300 hover:bg-white/10'
								}`}
							>
								<span className="font-medium">{team.name}</span>
								{team.id === activeTeamId && <span className="ml-1.5 text-xs text-slate-500">active</span>}
								<span className="ml-2 text-xs tabular-nums text-slate-400">
									{fit === 0 ? 'personne de valide' : `${fit} au combat`}
								</span>
							</button>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

/**
 * The camp's band, and the level it can carry you to.
 *
 * The two differ by one on purpose — a camp stopping at its last level would
 * strand everyone just short of the next camp's floor — so both are shown
 * rather than letting a level 25 reach 26 at a camp labelled "1 – 25".
 */
function Band({ camp }: { camp: Camp }) {
	return (
		<span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-200">
			Niveaux {camp.minLevel} – {camp.maxLevel}
			<span className="text-sky-300/70"> · mène au {camp.ceiling}</span>
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
	const [teams, setTeams] = useState<Team[] | null>(null)
	/** The team that walks in. Starts on the active one, then the player's pick. */
	const [teamId, setTeamId] = useState<string | null>(null)
	const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
	const [session, setSession] = useState<TrainingSession | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	/** Keep training without being asked, until something needs a decision. */
	const [chaining, setChaining] = useState(() => readFlag(CHAIN_KEY))
	/**
	 * Whether the chain may fire on its own yet.
	 *
	 * A remembered switch must not start a session the player never asked for:
	 * walking into a hut would spend the camp's slots and the team's health
	 * before anyone had pressed anything. So a restored preference shows the
	 * switch on and waits for the first manual session; flipping it by hand
	 * arms it at once, which is what the switch has always done.
	 */
	const [armed, setArmed] = useState(false)

	// The fight is a Battle, so it plays through the arena's own player.
	const [battle, setBattle] = useState<Battle | null>(null)
	const { view, play } = useBattlePlayback(battle)
	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

	useEscapeToClose(onClose)

	// The teams first: the camp's verdicts depend on which one is selected, so
	// the selection has to exist before the camps are asked for.
	useEffect(() => {
		let cancelled = false
		fetchTeams()
			.then((state) => {
				if (cancelled) return
				setTeams(state.teams)
				setActiveTeamId(state.activeTeamId)
				// The active team is the default; failing that, the first one that
				// still has somebody able to fight.
				const fit = (team: Team) =>
					team.members.some((member) => !member.inCare && !member.fainted)
				const active = state.teams.find((team) => team.id === state.activeTeamId)
				setTeamId((active ?? state.teams.find(fit) ?? state.teams[0])?.id ?? null)
			})
			.catch(() => !cancelled && setTeams([]))
		return () => {
			cancelled = true
		}
	}, [])

	useEffect(() => {
		if (teams === null) return
		let cancelled = false
		api
			.fetchCamps(teamId ?? undefined)
			.then(({ camps: found }) => !cancelled && setCamps(found))
			.catch(() => !cancelled && setCamps([]))
		return () => {
			cancelled = true
		}
	}, [teams, teamId])

	const camp = camps?.find((entry) => entry.id === campId) ?? null

	const train = useCallback(async () => {
		setBusy(true)
		setError(null)
		// One session the player started is all the chain needs to take over.
		setArmed(true)
		try {
			const result = await api.trainAt(campId, teamId ?? undefined)
			setSession(result)
			setBattle(result.battle)
			play(result.battle, reducedMotion)
			// The team levelled up and took wounds, so both the camp's verdict and
			// the roster the picker shows have changed.
			api.fetchCamps(teamId ?? undefined).then(({ camps: found }) => setCamps(found)).catch(() => undefined)
			fetchTeams().then((state) => setTeams(state.teams)).catch(() => undefined)
		} catch (cause) {
			setError(cause instanceof api.TrainingError ? cause.message : 'Serveur injoignable')
		} finally {
			setBusy(false)
		}
	}, [campId, teamId, play, reducedMotion])

	/** Flip the switch and remember it for the next camp, and the next visit. */
	const chooseChaining = useCallback((next: boolean) => {
		setChaining(next)
		setArmed(next)
		writeFlag(CHAIN_KEY, next)
	}, [])

	/**
	 * Switching teams invalidates the session on screen: it was another team's.
	 *
	 * The chain stops here too — sending another team into a fight the player
	 * did not ask for is exactly the decision chaining is not allowed to make.
	 * The stored preference is left alone on purpose: this is a pause, not the
	 * player changing their mind, so the switch comes back on at the next camp.
	 */
	const selectTeam = useCallback((next: string) => {
		setTeamId(next)
		setSession(null)
		setBattle(null)
		setError(null)
		setChaining(false)
		setArmed(false)
	}, [])

	/**
	 * Chaining: start the next session on its own once the last one has played.
	 *
	 * It waits for the fight to finish rather than firing on the response, so
	 * the chain never cuts an animation short — the sessions are not skippable
	 * either way. Anything that would need a decision stops it: an error, a
	 * camp that has nothing left to teach, or one the team cannot enter.
	 */
	useEffect(() => {
		if (!chaining || !armed || busy || view.playing || error) return
		if (!camp || !camp.unlocked || camp.exhausted) return

		const timer = setTimeout(() => void train(), CHAIN_PAUSE)
		return () => clearTimeout(timer)
	}, [chaining, armed, busy, view.playing, error, camp, train])

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
			<section
				role="dialog"
				aria-label={camp ? `Camp d’entraînement ${camp.name}` : 'Camp d’entraînement'}
				className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<Breadcrumb
							trail={[
								{ label: 'Carte', onClick: onClose },
								{ label: 'Camps d’entraînement' },
								{ label: camp?.name ?? 'Camp d’entraînement' },
							]}
							icon={GiBarracksTent}
							tone="text-sky-300"
						/>
						{camp && (
							<div className="mt-1 flex flex-wrap items-center gap-2">
								<span className="text-base text-slate-400">{camp.title}</span>
								<Band camp={camp} />
								{/* The camp picks its own trainee, so say who walks in next. */}
								<span className="text-xs text-slate-500">
									{camp.nextTrainee
										? `${camp.nextTrainee.name} ouvre (niveau ${camp.nextTrainee.level})`
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

						<TeamPicker
							teams={teams ?? []}
							selected={teamId}
							activeTeamId={activeTeamId}
							onSelect={selectTeam}
							disabled={busy || view.playing}
						/>

						{camp.roster > 0 && (
							<p className="mt-2 text-sm text-slate-400">
								{camp.roster === 1
									? 'Un seul Pokémon de la tranche : il affrontera un partenaire.'
									: `${camp.roster} Pokémon de la tranche entrent sur le terrain, un partenaire chacun. Celui qui met son partenaire K.O. passe la main.`}
								{camp.benched > 0 && (
									<span className="text-slate-500">
										{' '}
										{camp.benched === 1 ? '1 reste au banc' : `${camp.benched} restent au banc`} : hors de
										la tranche {camp.minLevel}–{camp.maxLevel}, rien à apprendre ici et donc rien à y
										perdre.
									</span>
								)}
							</p>
						)}

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
								Plus personne de cette équipe n’est dans la tranche {camp.minLevel}–{camp.maxLevel} : tu
								peux encore y sparrer, mais ce camp ne mène pas au-delà du niveau {camp.ceiling}. Le
								palier suivant est ailleurs sur la carte.
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
										L’expérience est partagée à parts égales entre les Pokémon entrés sur le terrain.
										Ce camp ne mène personne au-delà du niveau {session.band.ceiling} : arrivé là, un
										Pokémon laisse sa place au suivant.
									</p>
									<Gains session={session} />
								</>
							)}
						</div>

						<div className="mt-4 shrink-0">
							{/* Above the button on purpose: it decides what pressing it
							    will keep doing, so it is read before, not after. */}
							<Toggle
								checked={chaining}
								onChange={chooseChaining}
								disabled={!camp.unlocked || camp.exhausted || camp.roster === 0}
								label="Enchaîner les sessions"
								hint="La suivante part toute seule à la fin du combat."
							/>

							{view.playing ? (
								/* Deliberately not skippable: watching the session through is the point. */
								<p className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-4 py-3 text-center font-medium text-slate-400">
									Entraînement en cours…
								</p>
							) : (
								<button
									type="button"
									onClick={() => void train()}
									/* A camp that has nothing left to teach can still be sparred
									   in — it simply pays nothing. Only the floor turns you away. */
									disabled={busy || !camp.unlocked || camp.roster === 0}
									className="mt-2 w-full rounded-md bg-sky-500 px-4 py-3 font-semibold text-sky-950 transition hover:bg-sky-400 disabled:opacity-40"
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

						</div>
					</>
				)}
			</section>
		</div>
	)
}
