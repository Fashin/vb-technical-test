import { GiCrossedSwords } from 'react-icons/gi'

import { Breadcrumb } from '../ui'

/**
 * The wait between "accepted" and the first blow.
 *
 * A duel is resolved in one pass, and the chatbot writes the whole script
 * before anything is thrown — several seconds of nothing. The arena covers the
 * same wait with "Le combat s'écrit…" on the button the player just pressed;
 * a duel has no such button on either screen, so it gets this instead.
 *
 * Deliberately the same dialog shell as `DuelView`, which replaces it the
 * moment the fight arrives: the panel does not jump, it fills in.
 */
export function DuelPending({ opponentName }: { opponentName: string }) {
	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
			<section
				role="dialog"
				aria-busy="true"
				aria-label={`Duel contre ${opponentName}`}
				className="flex w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<Breadcrumb
						trail={[{ label: 'Carte' }, { label: `Duel contre ${opponentName}` }]}
						icon={GiCrossedSwords}
						tone="text-amber-300"
					/>
				</header>

				<div className="flex flex-col items-center gap-4 py-12">
					{/* Two blades closing in, as a wait that is clearly a wait. */}
					<div className="flex items-center gap-3" aria-hidden="true">
						<GiCrossedSwords className="h-10 w-10 animate-pulse text-amber-300" />
					</div>

					<p className="text-lg font-medium">Le duel s’écrit…</p>
					<p className="max-w-md text-center text-base text-slate-400">
						Les deux dresseurs préparent leur stratégie. Le combat est résolu d’un seul tenant, commentaire
						compris : cela prend quelques secondes.
					</p>

					{/* An indeterminate bar: there is no progress to report, only that
					    something is happening. */}
					<div className="h-1 w-56 overflow-hidden rounded-full bg-white/10">
						<div className="h-full w-1/3 animate-[duelWait_1.4s_ease-in-out_infinite] rounded-full bg-amber-300/80" />
					</div>
					<style>{`@keyframes duelWait {
						0% { transform: translateX(-100%); }
						100% { transform: translateX(300%); }
					}`}</style>
				</div>
			</section>
		</div>
	)
}
