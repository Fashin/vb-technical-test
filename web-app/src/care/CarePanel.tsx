import { useCallback, useEffect, useState } from 'react'
import { GiHealthNormal, GiHospitalCross } from 'react-icons/gi'

import { spriteUrlFor } from '../map'
import { HealthBar, LevelBadge } from '../progression'
import type { TeamMember } from '../teams'
import { Breadcrumb, useEscapeToClose } from '../ui'
import * as api from './api'
import type { CareState } from './api'

/**
 * The healing centre.
 *
 * Hit points lost in a fight stay lost, so this is where a run ends and the
 * next one is paid for: you hand the wounded over, and they are unavailable
 * until their treatment is done. The wait is the cost, and it is longer the
 * rarer the card — which is the whole reason to think twice before throwing a
 * legendary at a camp five levels above it.
 *
 * Every countdown here is a comparison against a moment the **server** chose
 * and stored. Nothing is timed in the browser; a reload shows the same clock.
 */

/** How often the countdowns are redrawn. */
const TICK_MS = 1000

function formatDelay(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000))
	const minutes = Math.floor(total / 60)
	const seconds = total % 60
	return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${seconds} s`
}

function Patient({
	member,
	now,
	estimate,
}: {
	member: TeamMember
	now: number
	/** What treatment would cost, for someone not yet admitted. */
	estimate?: number
}) {
	const remaining = member.healedAt ? member.healedAt - now : 0

	return (
		<li className="flex items-center gap-3 rounded-md bg-black/25 px-3 py-2">
			<img
				src={spriteUrlFor(member.pokedexId)}
				alt=""
				className={`h-12 w-12 [image-rendering:pixelated] ${member.fainted ? 'opacity-40 grayscale' : ''}`}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-base font-medium capitalize">{member.name}</span>
					<LevelBadge level={member.level} />
					{member.fainted && <span className="text-xs font-medium text-red-300">K.O.</span>}
				</div>
				<HealthBar health={member.health} className="mt-1.5" />
			</div>
			<span className="shrink-0 text-right text-sm tabular-nums text-slate-400">
				{member.inCare ? (
					remaining > 0 ? (
						<>
							<span className="block text-sky-300">{formatDelay(remaining)}</span>
							<span className="text-xs text-slate-500">en soins</span>
						</>
					) : (
						<span className="text-emerald-300">prêt</span>
					)
				) : (
					<>
						<span className="block">{Math.round(member.health * 100)}%</span>
						{estimate !== undefined && (
							<span className="text-xs text-slate-500">≈ {formatDelay(estimate)}</span>
						)}
					</>
				)}
			</span>
		</li>
	)
}

export function CarePanel({ onClose }: { onClose: () => void }) {
	const [care, setCare] = useState<CareState | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [now, setNow] = useState(() => Date.now())

	useEscapeToClose(onClose)

	const load = useCallback(() => {
		api
			.fetchCare()
			.then(({ care: found }) => setCare(found))
			.catch((cause) => setError(cause instanceof api.CareError ? cause.message : 'Serveur injoignable'))
	}, [])

	useEffect(load, [load])

	// One clock for every countdown on screen.
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), TICK_MS)
		return () => clearInterval(timer)
	}, [])

	// A treatment that has just finished is only released by the server, so ask
	// it again rather than declaring the card healed here.
	const due = care?.inCare.some((member) => member.healedAt !== null && member.healedAt <= now) ?? false
	useEffect(() => {
		if (due) load()
	}, [due, load])

	const admit = async () => {
		setBusy(true)
		setError(null)
		try {
			const result = await api.admitCards()
			setCare(result.care)
		} catch (cause) {
			setError(cause instanceof api.CareError ? cause.message : 'Serveur injoignable')
		} finally {
			setBusy(false)
		}
	}

	const healthy = care?.members.filter((member) => !member.inCare && member.health >= 1) ?? []

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
			<section
				role="dialog"
				aria-label="Centre de soins"
				className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-start justify-between gap-3">
					<div>
						<Breadcrumb
							trail={[
								{ label: 'Carte', onClick: onClose },
								{ label: 'Centre de soins' },
							]}
							icon={GiHospitalCross}
							tone="text-red-300"
						/>
						<p className="mt-1 text-base text-slate-400">
							Les PV perdus ne reviennent pas tout seuls. Le temps de soin dépend de la rareté de la carte
							et de ce qu’elle a encaissé.
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

				{care === null ? (
					<p className="py-10 text-center text-base text-slate-500">Chargement…</p>
				) : care.members.length === 0 ? (
					<p className="py-10 text-center text-base text-slate-500">
						Aucune équipe composée — passe par « Mon équipe » pour en monter une.
					</p>
				) : (
					<div className="mt-4 min-h-0 flex-1 overflow-y-auto">
						{care.inCare.length > 0 && (
							<>
								<h3 className="text-xs uppercase tracking-wide text-slate-500">En soins</h3>
								<ul className="mt-2 space-y-2">
									{care.inCare.map((member) => (
										<Patient key={member.cardId} member={member} now={now} />
									))}
								</ul>
							</>
						)}

						{care.wounded.length > 0 && (
							<>
								<h3 className="mt-4 text-xs uppercase tracking-wide text-slate-500">
									Au comptoir
								</h3>
								<ul className="mt-2 space-y-2">
									{care.wounded.map((member) => (
										<Patient
											key={member.cardId}
											member={member}
											now={now}
											estimate={care.estimates[member.cardId]}
										/>
									))}
								</ul>
							</>
						)}

						{healthy.length > 0 && (
							<>
								<h3 className="mt-4 text-xs uppercase tracking-wide text-slate-500">
									En pleine forme
								</h3>
								<ul className="mt-2 space-y-2">
									{healthy.map((member) => (
										<Patient key={member.cardId} member={member} now={now} />
									))}
								</ul>
							</>
						)}
					</div>
				)}

				{care && care.members.length > 0 && (
					<button
						type="button"
						onClick={() => void admit()}
						disabled={busy || care.wounded.length === 0 || !care.atCounter}
						className="mt-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-md bg-red-400 px-4 py-3 font-semibold text-red-950 transition hover:bg-red-300 disabled:opacity-40"
					>
						<GiHealthNormal className="h-6 w-6" />
						{care.wounded.length === 0
							? 'Personne à soigner'
							: `Confier ${care.wounded.length} Pokémon aux soins`}
					</button>
				)}
			</section>
		</div>
	)
}
