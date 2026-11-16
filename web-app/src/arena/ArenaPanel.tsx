import { useEffect, useRef, useState } from 'react'
import { GiCrossedSwords, GiLaurelCrown } from 'react-icons/gi'

import { BattleView } from '../battle'
import { spriteUrlFor } from '../map'
import { LevelBadge } from '../progression'
import { fetchTeams, type Team } from '../teams'
import { TrainerPortrait } from '../trainer'
import { Breadcrumb, useEscapeToClose } from '../ui'
import { ArenaError, fetchMasters, type Master } from './api'
import { typeStyle } from '../pokemon'

/** Difficulty as a row of pips — faster to compare than "tier 7". */
function Difficulty({ tier }: { tier: number }) {
	return (
		<span className="flex items-center gap-0.5" aria-label={`Difficulté ${tier} sur 10`}>
			{Array.from({ length: 10 }, (_, index) => (
				<span
					key={index}
					className={`h-2 w-2 rounded-full ${index < tier ? 'bg-amber-400' : 'bg-white/15'}`}
				/>
			))}
		</span>
	)
}

function MasterCard({
	master,
	ready,
	onChallenge,
}: {
	master: Master
	/** False while the player has no team fielded — nothing to fight with. */
	ready: boolean
	onChallenge: (master: Master) => void
}) {
	const style = typeStyle(master.type)

	return (
		<li
			className={`flex gap-3 rounded-lg border p-3 ${
				master.defeated ? 'border-emerald-500/40 bg-emerald-950/15' : 'border-white/10 bg-black/25'
			}`}
		>
			<div className="flex shrink-0 flex-col items-center gap-1">
				<div className="rounded-md border border-white/10 bg-gradient-to-b from-emerald-900/30 to-black/40 p-1.5">
					<TrainerPortrait appearance={master.appearance} scale={3} label={`Portrait de ${master.name}`} />
				</div>
				<Difficulty tier={master.tier} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<h3 className="truncate font-semibold">{master.name}</h3>
					<span className={`rounded px-1.5 py-0.5 text-xs font-medium ${style.chip}`}>{style.label}</span>
					{/* Announced up front: walking into a level 90 team should be a choice. */}
					<LevelBadge level={master.level} />
					{master.defeated && (
						<span
							className="flex items-center gap-1 text-xs text-emerald-300"
							title="Déjà vaincu — la récompense n’est versée qu’à la première victoire"
						>
							<GiLaurelCrown className="h-4 w-4" />
							Vaincu
						</span>
					)}
				</div>

				<p className="truncate text-sm text-slate-400">{master.title}</p>
				<p className="mt-1 line-clamp-2 text-sm italic text-slate-500">« {master.blurb} »</p>

				<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
					{/* Six sprites, so the row wraps and they shrink rather than push the
					    "Défier" button off a phone screen. */}
					<ul className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Équipe">
						{master.team.map((pokedexId) => (
							<li key={pokedexId}>
								<img
									src={spriteUrlFor(pokedexId)}
									alt=""
									loading="lazy"
									className="h-9 w-9 [image-rendering:pixelated] sm:h-11 sm:w-11"
								/>
							</li>
						))}
					</ul>

					<div className="flex shrink-0 items-center gap-2">
						<span className="text-xs text-amber-300">
							{master.reward} booster{master.reward > 1 ? 's' : ''}
						</span>
						<button
							type="button"
							disabled={!ready}
							onClick={() => onChallenge(master)}
							title={ready ? undefined : 'Compose une équipe avant de défier un maître'}
							className="rounded-md bg-emerald-500 px-3 py-1.5 text-base font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Défier
						</button>
					</div>
				</div>
			</div>
		</li>
	)
}

/**
 * The PvE ladder.
 *
 * Ten masters in difficulty order, each with the trainer sprite they would
 * have on the map, their speciality and the team they send out. The roster is
 * served by the backend, not hardcoded here: who you fight and what it pays
 * are game rules, and a client that owned them would own the reward table.
 */
export function ArenaPanel({
	onClose,
	onRewarded,
}: {
	onClose: () => void
	/** Called when a battle paid out, so the booster stock can be re-read. */
	onRewarded: () => void
}) {
	const [masters, setMasters] = useState<Master[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [challenged, setChallenged] = useState<Master | null>(null)
	// `null` while loading, so the "no team" warning does not flash before the
	// teams have arrived.
	const [activeTeam, setActiveTeam] = useState<Team | null | undefined>(undefined)
	const backdrop = useRef<HTMLDivElement>(null)

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

	useEffect(() => {
		let cancelled = false
		fetchMasters()
			.then(({ masters: found }) => {
				if (!cancelled) setMasters(found)
			})
			.catch((cause) => {
				if (cancelled) return
				setError(cause instanceof ArenaError ? cause.message : 'Serveur injoignable')
				setMasters([])
			})
		return () => {
			cancelled = true
		}
	}, [])

	// Which team would go in. A master cannot be challenged without one, so the
	// arena says so up front rather than failing at the first round.
	useEffect(() => {
		let cancelled = false
		fetchTeams()
			.then(({ teams, activeTeamId }) => {
				if (cancelled) return
				setActiveTeam(teams.find((team) => team.id === activeTeamId) ?? null)
			})
			.catch(() => {
				if (!cancelled) setActiveTeam(null)
			})
		return () => {
			cancelled = true
		}
	}, [])

	const loadingTeam = activeTeam === undefined
	const ready = (activeTeam?.members.length ?? 0) > 0

	const beaten = masters?.filter((master) => master.defeated).length ?? 0

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
				aria-label="Arène"
				className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<Breadcrumb
						trail={[
							{ label: 'Carte', onClick: onClose },
							{ label: 'Arène' },
						]}
						icon={GiCrossedSwords}
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
					{masters === null
						? 'Chargement…'
						: `${beaten} maître${beaten > 1 ? 's' : ''} vaincu${beaten > 1 ? 's' : ''} sur ${masters.length}`}
				</p>

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				{!ready && !loadingTeam && (
					<p className="mt-3 rounded-md bg-amber-500/15 px-3 py-2 text-base text-amber-200">
						Compose d’abord une équipe dans « Mon équipe » — tu ne peux pas défier un maître les mains vides.
					</p>
				)}

				{ready && activeTeam && (
					<p className="mt-3 flex items-center gap-2 text-sm text-slate-400">
						<span>Tu combats avec</span>
						<span className="font-medium text-slate-200">{activeTeam.name}</span>
						<span className="flex items-center gap-0.5">
							{activeTeam.members.map((member) => (
								<img
									key={member.cardId}
									src={spriteUrlFor(member.pokedexId)}
									alt=""
									className="h-7 w-7 [image-rendering:pixelated]"
								/>
							))}
						</span>
					</p>
				)}


				<ul className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
					{masters?.map((master) => (
						<MasterCard
							key={master.id}
							master={master}
							ready={ready && !loadingTeam}
							onChallenge={setChallenged}
						/>
					))}
				</ul>
			</section>

			{challenged && (
				<BattleView
					master={challenged}
					onRewarded={onRewarded}
					onClose={() => {
						setChallenged(null)
						// The roster's "vaincu" badges and the booster count may have
						// just changed; re-read rather than guess.
						void fetchMasters().then(({ masters: found }) => setMasters(found)).catch(() => undefined)
					}}
				/>
			)}
		</div>
	)
}
