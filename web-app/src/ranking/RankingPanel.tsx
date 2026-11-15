import { useEffect, useState } from 'react'
import { GiCrossedSwords, GiLaurelCrown, GiPodium } from 'react-icons/gi'

import { LevelBadge } from '../progression'
import { TrainerPortrait } from '../trainer'
import { Breadcrumb, useEscapeToClose } from '../ui'
import * as api from './api'
import type { RankedTrainer } from './api'

/**
 * The trainer ranking.
 *
 * Every figure here is counted server-side from what players actually did, so
 * the panel only has to render. The order is the arena's: masters beaten
 * first, because unlike a Pokédex or a level, a master cannot be ground out
 * with time alone.
 */

/** Medals for the podium; everyone else gets their number. */
const MEDALS = ['🥇', '🥈', '🥉']

function Bar({ ratio, tone }: { ratio: number; tone: string }) {
	return (
		<div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/50">
			<div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
		</div>
	)
}

function lastSeen(at: number): string {
	const minutes = Math.round((Date.now() - at) / 60_000)
	if (minutes < 1) return 'à l’instant'
	if (minutes < 60) return `il y a ${minutes} min`
	const hours = Math.round(minutes / 60)
	if (hours < 24) return `il y a ${hours} h`
	return `il y a ${Math.round(hours / 24)} j`
}

function Row({ trainer, isYou }: { trainer: RankedTrainer; isYou: boolean }) {
	return (
		<li
			className={`flex items-center gap-3 rounded-lg border p-3 ${
				isYou ? 'border-emerald-400/60 bg-emerald-950/25' : 'border-white/10 bg-black/25'
			}`}
		>
			<span className="w-7 shrink-0 text-center text-base font-bold tabular-nums text-slate-300">
				{MEDALS[trainer.rank - 1] ?? trainer.rank}
			</span>

			<div className="relative shrink-0 rounded-md border border-white/10 bg-gradient-to-b from-emerald-900/30 to-black/40 p-1">
				<TrainerPortrait appearance={trainer.appearance} scale={2} label={`Portrait de ${trainer.name}`} />
				{trainer.online && (
					<span
						title="En ligne"
						className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#141c17]"
					/>
				)}
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium">{trainer.name}</span>
					{isYou && <span className="text-xs text-emerald-300">toi</span>}
					{trainer.bestLevel > 0 && <LevelBadge level={trainer.bestLevel} />}
				</div>

				<p className="truncate text-xs text-slate-500">
					{trainer.band ?? 'aucune carte'}
					{trainer.cards > 0 && ` · ${trainer.cards} carte${trainer.cards > 1 ? 's' : ''}`}
					{trainer.inCare > 0 && ` · ${trainer.inCare} en soins`}
					{!trainer.online && ` · ${lastSeen(trainer.lastSeenAt)}`}
				</p>
			</div>

			{/* Masters: the headline, and what the ranking is sorted on. */}
			<div className="w-20 shrink-0 text-right">
				<span className="flex items-center justify-end gap-1 text-base font-semibold tabular-nums">
					<GiLaurelCrown className="h-5 w-5 text-amber-300" />
					{trainer.masters}
					<span className="text-xs font-normal text-slate-500">/{trainer.mastersTotal}</span>
				</span>
				<Bar ratio={trainer.masters / Math.max(1, trainer.mastersTotal)} tone="bg-amber-400" />
			</div>

			<div className="w-16 shrink-0 text-right">
				<span className="flex items-center justify-end gap-1 text-base font-semibold tabular-nums">
					<GiCrossedSwords className="h-5 w-5 text-sky-300" />
					{trainer.duels}
				</span>
			</div>

			<div className="w-24 shrink-0 text-right">
				<span className="text-base font-semibold tabular-nums">{trainer.dexPercent}%</span>
				<span className="ml-1 text-xs text-slate-500">
					{trainer.dexOwned}/{trainer.dexTotal}
				</span>
				<Bar ratio={trainer.dexOwned / Math.max(1, trainer.dexTotal)} tone="bg-sky-400" />
			</div>
		</li>
	)
}

export function RankingPanel({ onClose }: { onClose: () => void }) {
	const [trainers, setTrainers] = useState<RankedTrainer[] | null>(null)
	const [you, setYou] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEscapeToClose(onClose)

	useEffect(() => {
		let cancelled = false
		api
			.fetchRanking()
			.then(({ trainers: found, you: me }) => {
				if (cancelled) return
				setTrainers(found)
				setYou(me)
			})
			.catch((cause) => {
				if (cancelled) return
				setError(cause instanceof api.RankingError ? cause.message : 'Serveur injoignable')
				setTrainers([])
			})
		return () => {
			cancelled = true
		}
	}, [])

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
			<section
				role="dialog"
				aria-label="Classement des dresseurs"
				className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-start justify-between gap-3">
					<div>
						<Breadcrumb
							trail={[
								{ label: 'Carte', onClick: onClose },
								{ label: 'Classement' },
							]}
							icon={GiPodium}
							tone="text-amber-300"
						/>
						<p className="mt-1 text-base text-slate-400">
							Classés sur les maîtres vaincus, puis sur le Pokédex, puis sur les duels gagnés.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				{trainers === null ? (
					<p className="py-10 text-center text-base text-slate-500">Chargement…</p>
				) : trainers.length === 0 ? (
					<p className="py-10 text-center text-base text-slate-500">Aucun dresseur pour l’instant.</p>
				) : (
					<>
						{/* Column headings, so the two right-hand numbers are readable. */}
						<div className="mt-4 flex items-center gap-3 px-3 text-xs uppercase tracking-wide text-slate-500">
							<span className="w-7 shrink-0" />
							<span className="shrink-0" style={{ width: '2.75rem' }} />
							<span className="min-w-0 flex-1">Dresseur</span>
							<span className="w-20 shrink-0 text-right">Maîtres</span>
						<span className="w-16 shrink-0 text-right">Duels</span>
							<span className="w-24 shrink-0 text-right">Pokédex</span>
						</div>

						<ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
							{trainers.map((trainer) => (
								<Row key={trainer.userId} trainer={trainer} isYou={trainer.userId === you} />
							))}
						</ul>
					</>
				)}
			</section>
		</div>
	)
}
