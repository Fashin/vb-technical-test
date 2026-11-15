import { useEffect, useMemo, useState } from 'react'
import { GiCardRandom, GiCrossedSwords, GiPodium, GiTrophy, GiWeightLiftingUp } from 'react-icons/gi'

import { Breadcrumb, useEscapeToClose } from '../ui'
import * as api from './api'
import type { Achievement, AchievementSummary, Category } from './api'

/**
 * The trophy cabinet.
 *
 * Every entry is derived server-side from what the player actually did, so
 * this panel only renders. Locked entries are shown rather than hidden, with
 * how far along they are: a list of things you have not done yet is the part
 * that gives a player somewhere to go.
 */

const CATEGORY_ICONS: Record<Category, typeof GiTrophy> = {
	arene: GiCrossedSwords,
	pokedex: GiCardRandom,
	entrainement: GiWeightLiftingUp,
	dresseur: GiPodium,
}

/** Categories in the order a player meets them. */
const ORDER: Category[] = ['arene', 'pokedex', 'entrainement', 'dresseur']

function Entry({ achievement }: { achievement: Achievement }) {
	const { unlocked, progress, target } = achievement
	const ratio = Math.min(1, target > 0 ? progress / target : 0)
	// A one-shot achievement has nothing to show on a bar; a tally does.
	const showBar = !unlocked && target > 1

	return (
		<li
			className={`flex items-center gap-3 rounded-lg border p-3 ${
				unlocked ? 'border-amber-400/50 bg-amber-950/20' : 'border-white/10 bg-black/25'
			}`}
		>
			<GiTrophy
				className={`h-7 w-7 shrink-0 ${unlocked ? 'text-amber-300' : 'text-slate-700'}`}
				aria-hidden
			/>

			<div className="min-w-0 flex-1">
				<p className={`truncate font-medium ${unlocked ? 'text-slate-100' : 'text-slate-400'}`}>
					{achievement.name}
				</p>
				<p className="truncate text-sm text-slate-500">{achievement.description}</p>
				{showBar && (
					<div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/50">
						<div className="h-full rounded-full bg-sky-400" style={{ width: `${ratio * 100}%` }} />
					</div>
				)}
			</div>

			<span
				className={`shrink-0 text-sm tabular-nums ${unlocked ? 'text-amber-300' : 'text-slate-500'}`}
			>
				{unlocked
					? achievement.unlockedAt
						? new Date(achievement.unlockedAt).toLocaleDateString('fr-FR')
						: 'obtenu'
					: target > 1
						? `${progress}/${target}`
						: '—'}
			</span>
		</li>
	)
}

export function AchievementsPanel({ onClose }: { onClose: () => void }) {
	const [summary, setSummary] = useState<AchievementSummary | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEscapeToClose(onClose)

	useEffect(() => {
		let cancelled = false
		api
			.fetchAchievements()
			.then((found) => !cancelled && setSummary(found))
			.catch((cause) => {
				if (cancelled) return
				setError(cause instanceof api.AchievementError ? cause.message : 'Serveur injoignable')
			})
		return () => {
			cancelled = true
		}
	}, [])

	// Grouped once per load, in the order a player meets them.
	const groups = useMemo(() => {
		if (!summary) return []
		return ORDER.map((category) => ({
			category,
			label: summary.categories[category] ?? category,
			// Earned first inside a group, so the cabinet reads as a cabinet.
			entries: summary.achievements
				.filter((achievement) => achievement.category === category)
				.sort((a, b) => Number(b.unlocked) - Number(a.unlocked)),
		})).filter((group) => group.entries.length > 0)
	}, [summary])

	const ratio = summary && summary.total > 0 ? summary.unlocked / summary.total : 0

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
			<section
				role="dialog"
				aria-label="Succès"
				className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<Breadcrumb
							trail={[
								{ label: 'Carte', onClick: onClose },
								{ label: 'Succès' },
							]}
							icon={GiTrophy}
							tone="text-amber-300"
						/>
						{summary && (
							<p className="mt-0.5 text-base text-slate-400">
								{summary.unlocked}/{summary.total} débloqués
							</p>
						)}
						{summary && (
							<div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-black/50">
								<div
									className="h-full rounded-full bg-amber-400 transition-[width] duration-700 ease-out"
									style={{ width: `${ratio * 100}%` }}
								/>
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

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				{summary === null ? (
					!error && <p className="py-10 text-center text-base text-slate-500">Chargement…</p>
				) : (
					<div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto">
						{groups.map((group) => {
							const Icon = CATEGORY_ICONS[group.category]
							const done = group.entries.filter((entry) => entry.unlocked).length

							return (
								<div key={group.category}>
									<h3 className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-500">
										<Icon className="h-5 w-5" aria-hidden />
										{group.label}
										<span className="tabular-nums">
											{done}/{group.entries.length}
										</span>
									</h3>
									<ul className="mt-2 space-y-2">
										{group.entries.map((achievement) => (
											<Entry key={achievement.id} achievement={achievement} />
										))}
									</ul>
								</div>
							)
						})}
					</div>
				)}
			</section>
		</div>
	)
}
