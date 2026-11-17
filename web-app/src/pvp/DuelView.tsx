import { useEffect, useState } from 'react'
import { GiBrokenHeart, GiCrossedSwords, GiLaurelCrown, GiLevelEndFlag } from 'react-icons/gi'

import { BattleField, sideWithPlaybackHp, useBattlePlayback } from '../battle'
import { LevelBadge, XpBar } from '../progression'
import type { DuelResult } from './usePvp'
import { Breadcrumb } from '../ui'

/**
 * A duel, played out.
 *
 * The payload arrives already written from this client's point of view — the
 * reader is always the `player` side — so this reuses the arena's field and
 * playback untouched: same animation, same commentary on the same beat, and
 * no way to skip ahead.
 */
export function DuelView({ duel, onClose }: { duel: DuelResult; onClose: () => void }) {
	const [battle] = useState(duel.battle)
	const { view, play } = useBattlePlayback(battle)

	const reducedMotion =
		typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

	// The fight is handed over resolved, so it plays as soon as it is on screen.
	useEffect(() => {
		play(battle, reducedMotion)
		// Only once: replaying would re-animate a fight that already happened.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [battle])

	const over = !view.playing

	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
			<section
				role="dialog"
				aria-label={`Duel contre ${battle.master.name}`}
				className="my-auto flex max-h-[88dvh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex shrink-0 items-center justify-between">
					<Breadcrumb
						trail={[
							{ label: 'Carte' },
							{ label: `Duel contre ${battle.master.name}` },
						]}
						icon={GiCrossedSwords}
						tone="text-amber-300"
					/>
				</header>

				{duel.degraded && (
					<p className="mt-3 shrink-0 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
						Le chatbot n’a pas rendu de script exploitable : ce duel a été improvisé par le serveur.
					</p>
				)}

				<div className="mt-4 min-h-0 overflow-y-auto">
					<BattleField
						player={sideWithPlaybackHp(battle.player, view.playerHp, view.playerActive)}
						master={sideWithPlaybackHp(battle.master, view.masterHp, view.masterActive)}
						view={view}
					/>
				</div>

				<div className="mt-3 min-h-0 flex-1 overflow-y-auto">
					{over && duel.gains.length > 0 && (
						<ul className="space-y-2">
							{duel.gains.map((gain) => (
								<li key={gain.cardId} className="flex items-center gap-3 rounded-md bg-black/25 px-3 py-2">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="truncate text-base font-medium capitalize">{gain.name}</span>
											<LevelBadge level={gain.after.level} />
											{gain.after.level > gain.before.level && (
												<span className="flex items-center gap-1 text-sm font-medium text-emerald-300">
													<GiLevelEndFlag className="h-4 w-4" />+{gain.after.level - gain.before.level}
												</span>
											)}
										</div>
										<XpBar ratio={gain.after.ratio} toNextLevel={gain.after.toNextLevel} className="mt-2" />
									</div>
									<span className="shrink-0 text-sm tabular-nums text-sky-300">+{gain.gained} XP</span>
								</li>
							))}
						</ul>
					)}
				</div>

				{over ? (
					<div
						className={`mt-4 shrink-0 rounded-lg p-4 text-center ${
							duel.won ? 'bg-emerald-500/15' : 'bg-red-500/15'
						}`}
					>
						<p className="flex items-center justify-center gap-2 text-xl font-semibold">
							{duel.won ? (
								<>
									<GiLaurelCrown className="h-7 w-7 text-amber-300" /> Victoire !
								</>
							) : (
								<>
									<GiBrokenHeart className="h-7 w-7 text-red-300" /> Défaite…
								</>
							)}
						</p>
						<p className="mt-1 text-base text-slate-300">
							Les deux équipes ressortent marquées : les PV perdus restent perdus.
						</p>
						<button
							type="button"
							onClick={onClose}
							className="mt-3 rounded-md bg-emerald-500 px-4 py-2 text-base font-medium text-emerald-950 hover:bg-emerald-400"
						>
							Retour à la carte
						</button>
					</div>
				) : (
					/* No way to skip ahead: the duel is the thing you came for. */
					<p className="mt-4 w-full shrink-0 rounded-md border border-white/10 bg-black/30 px-4 py-3 text-center text-base font-medium text-slate-400">
						Le duel fait rage…
					</p>
				)}
			</section>
		</div>
	)
}
