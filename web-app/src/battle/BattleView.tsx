import { useEffect, useRef, useState } from 'react'
import { GiCrossedSwords, GiLaurelCrown, GiBrokenHeart } from 'react-icons/gi'

import type { Master } from '../arena/api'
import { spriteUrlFor } from '../map'
import { LevelBadge } from '../progression'
import { fetchTeams, type Team } from '../teams'
import { useEscapeToClose } from '../ui'
import * as api from './api'
import type { Battle, RoundLog } from './api'
import { BattleField } from './BattleField'
import { sideWithPlaybackHp, useBattlePlayback } from './useBattlePlayback'

/** One round, written out the way the games narrate a turn. */
function RoundEntry({ round, playerName, masterName }: { round: RoundLog; playerName: string; masterName: string }) {
	return (
		<li className="border-t border-white/5 py-2 first:border-0">
			<p className="text-xs uppercase tracking-wide text-slate-500">Tour {round.round}</p>
			{round.events.map((event, index) => (
				<div key={index}>
					<p className="text-base text-slate-200">
						<span className={event.side === 'player' ? 'text-emerald-300' : 'text-amber-300'}>
							{event.side === 'player' ? playerName : masterName}
						</span>{' '}
						utilise <span className="font-medium">{event.move.name}</span> — {event.damage} dégâts
						{event.critical && <span className="text-amber-300"> · coup critique !</span>}
						{event.effectiveness && <span className="text-slate-400"> · {event.effectiveness}</span>}
						{event.fainted && (
							<span className="text-red-300">
								{' '}
								· K.O.{event.replacedBy ? ` — ${event.replacedBy} entre en jeu !` : ''}
							</span>
						)}
					</p>
					{event.line && <p className="text-base italic text-slate-400">{event.line}</p>}
				</div>
			))}
		</li>
	)
}

/* ------------------------------ team selection ------------------------------ */

function TeamPicker({
	master,
	onPick,
	busy,
	error,
}: {
	master: Master
	onPick: (teamId: string) => void
	busy: boolean
	error: string | null
}) {
	const [teams, setTeams] = useState<Team[] | null>(null)
	const [activeId, setActiveId] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		fetchTeams()
			.then(({ teams: found, activeTeamId }) => {
				if (cancelled) return
				setTeams(found)
				setActiveId(activeTeamId)
			})
			.catch(() => !cancelled && setTeams([]))
		return () => {
			cancelled = true
		}
	}, [])

	const usable = teams?.filter((team) => team.members.length > 0) ?? []

	return (
		<div>
			<p className="text-base text-slate-300">
				<span className="font-medium">{master.name}</span> envoie {master.team.length} Pokémon. Avec quelle
				équipe pars-tu&nbsp;?
			</p>

			{error && (
				<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
					{error}
				</p>
			)}

			{teams === null ? (
				<p className="py-8 text-center text-base text-slate-500">Chargement…</p>
			) : usable.length === 0 ? (
				<p className="py-8 text-center text-base text-slate-500">
					Aucune équipe composée — passe par « Mon équipe » pour en monter une.
				</p>
			) : (
				<ul className="mt-3 space-y-2">
					{usable.map((team) => (
						<li key={team.id}>
							<button
								type="button"
								disabled={busy}
								onClick={() => onPick(team.id)}
								className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-black/25 p-3 text-left transition hover:border-emerald-400/60 hover:bg-black/40 disabled:opacity-40"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium">
										{team.name}
										{team.id === activeId && <span className="ml-2 text-xs text-emerald-300">en lice</span>}
									</p>
									<p className="text-sm text-slate-500">{team.members.length} Pokémon</p>
								</div>
								<ul className="flex gap-1">
									{team.members.map((member) => (
										<li key={member.cardId} className="flex flex-col items-center">
											<img
												src={spriteUrlFor(member.pokedexId)}
												alt=""
												className="h-10 w-10 [image-rendering:pixelated]"
											/>
											<LevelBadge level={member.level} />
										</li>
									))}
								</ul>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

/* --------------------------------- the view -------------------------------- */

/**
 * A battle against a master.
 *
 * Two steps, as asked: pick the team, then watch the fight. Everything that
 * happens in it is decided by the server in a single request — this view asks
 * for the battle once and animates the answer from end to end. It never
 * computes a hit point, and it never asks the player to click through a round.
 */
export function BattleView({
	master,
	onClose,
	onRewarded,
}: {
	master: Master
	onClose: () => void
	/** Called once a win has actually paid boosters out. */
	onRewarded: () => void
}) {
	const [battle, setBattle] = useState<Battle | null>(null)
	const [narrated, setNarrated] = useState(true)
	const [improvised, setImprovised] = useState(false)
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const backdrop = useRef<HTMLDivElement>(null)
	const logEnd = useRef<HTMLDivElement>(null)

	const { view, play, reset } = useBattlePlayback(battle)
	// Players who asked for less movement get the result, not the show.
	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

	// Resume whatever is already running before offering to start a new one.
	useEffect(() => {
		let cancelled = false
		api
			.fetchBattle()
			.then(({ battle: found, narrated: live }) => {
				if (cancelled) return
				setBattle(found)
				if (found) reset(found)
				setNarrated(live)
			})
			.catch(() => undefined)
			.finally(() => !cancelled && setLoading(false))
		return () => {
			cancelled = true
		}
	}, [reset])

	// Keep the newest round in view without yanking the whole panel around.
	useEffect(() => {
		logEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
	}, [view.round])

	/** Ask for the whole fight, then play it. */
	const run = async () => {
		setBusy(true)
		setError(null)
		try {
			const { battle: resolved, degraded } = await api.runBattle()
			setBattle(resolved)
			setImprovised(degraded)
			play(resolved, reducedMotion)
			if (resolved.status === 'won' && resolved.reward) onRewarded()
		} catch (cause) {
			setError(cause instanceof api.BattleError ? cause.message : 'Serveur injoignable')
		} finally {
			setBusy(false)
		}
	}

	const start = async (teamId: string) => {
		setBusy(true)
		setError(null)
		try {
			const result = await api.startBattle(master.id, teamId)
			setBattle(result.battle)
			reset(result.battle)
			setNarrated(result.narrated)
		} catch (cause) {
			setError(cause instanceof api.BattleError ? cause.message : 'Serveur injoignable')
			return
		} finally {
			setBusy(false)
		}
		// The team is the only choice the player makes; the fight follows at once.
		await run()
	}

	/**
	 * Giving up for good. Closing the panel does not do this — a battle left
	 * open is resumed next time, which is the whole point of persisting it —
	 * so forfeiting has to be its own deliberate action.
	 */
	const forfeit = async () => {
		setBusy(true)
		await api.forfeitBattle().catch(() => undefined)
		onClose()
	}

	// The result screen waits for the last knockout to finish playing.
	const over = battle !== null && battle.status !== 'active' && !view.playing
	// The log fills in at the replay's pace rather than all at once.
	const told = battle?.log.filter((round) => round.round <= view.round) ?? []

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 outline-none"
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
		>
			<section
				role="dialog"
				aria-label={`Combat contre ${master.name}`}
				className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<h2 className="flex items-center gap-2 text-xl font-semibold">
						<GiCrossedSwords className="h-6 w-6 text-emerald-300" />
						{master.name}
						<span className="text-base font-normal text-slate-400">{master.title}</span>
					</h2>
					<button
						type="button"
						onClick={onClose}
						title={battle?.status === 'active' ? 'Le combat reprendra où tu l’as laissé' : undefined}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				{loading ? (
					<p className="py-10 text-center text-base text-slate-500">Chargement…</p>
				) : !battle ? (
					<div className="mt-4">
						<TeamPicker master={master} onPick={(id) => void start(id)} busy={busy} error={error} />
					</div>
				) : (
					<>
						{!narrated ? (
							<p className="mt-3 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
								Le chatbot n’est pas configuré : les attaques sont improvisées par le serveur et le combat
								n’est pas commenté.
							</p>
						) : (
							improvised && (
								<p className="mt-3 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
									Le chatbot n’a pas rendu de script exploitable : ce combat a été improvisé par le serveur.
								</p>
							)
						)}

						<div className="mt-4">
							<BattleField
								player={sideWithPlaybackHp(battle.player, view.playerHp, view.playerActive)}
								master={sideWithPlaybackHp(battle.master, view.masterHp, view.masterActive)}
								view={view}
							/>
						</div>

						{error && (
							<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
								{error}
							</p>
						)}

						{/* Log */}
						<ul className="mt-3 min-h-[6rem] flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/25 px-3">
							{told.length === 0 ? (
								<li className="py-4 text-center text-base text-slate-500">
									{busy ? 'Les dresseurs préparent leur stratégie…' : 'Le combat commence. À toi de lancer l’assaut.'}
								</li>
							) : (
								told.map((round) => (
									<RoundEntry
										key={round.round}
										round={round}
										playerName={battle.player.name}
										masterName={battle.master.name}
									/>
								))
							)}
							<div ref={logEnd} />
						</ul>

						{over ? (
							<div
								className={`mt-4 rounded-lg p-4 text-center ${
									battle.status === 'won' ? 'bg-emerald-500/15' : 'bg-red-500/15'
								}`}
							>
								<p className="flex items-center justify-center gap-2 text-xl font-semibold">
									{battle.status === 'won' ? (
										<>
											<GiLaurelCrown className="h-7 w-7 text-amber-300" /> Victoire !
										</>
									) : (
										<>
											<GiBrokenHeart className="h-7 w-7 text-red-300" /> Défaite…
										</>
									)}
								</p>
								{battle.status === 'won' && (
									<p className="mt-1 text-base text-slate-300">
										{battle.reward
											? `${battle.reward} booster${battle.reward > 1 ? 's' : ''} ajouté${
													battle.reward > 1 ? 's' : ''
												} à ta réserve.`
											: 'Déjà vaincu : la récompense n’est versée qu’à la première victoire.'}
									</p>
								)}
								<button
									type="button"
									onClick={onClose}
									className="mt-3 rounded-md bg-emerald-500 px-4 py-2 font-medium text-emerald-950 hover:bg-emerald-400"
								>
									Retour à l’arène
								</button>
							</div>
						) : view.playing ? (
							/* No way to skip ahead: the fight is the thing you came for. */
							<p className="mt-4 w-full rounded-md border border-white/10 bg-black/30 px-4 py-3 text-center font-medium text-slate-400">
								Le combat fait rage…
							</p>
						) : (
							<>
								<button
									type="button"
									onClick={() => void run()}
									disabled={busy}
									className="mt-4 w-full rounded-md bg-emerald-500 px-4 py-3 font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
								>
									{busy ? 'Le combat s’écrit…' : 'Lancer le combat'}
								</button>
								<button
									type="button"
									onClick={() => void forfeit()}
									disabled={busy}
									className="mt-2 self-center text-sm text-red-300/80 hover:text-red-200 hover:underline disabled:opacity-40"
								>
									Abandonner le combat
								</button>
							</>
						)}
					</>
				)}
			</section>
		</div>
	)
}
