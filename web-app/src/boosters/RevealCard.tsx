import { CardFace } from './CardFace'
import { RARITY } from './rarity'
import type { Card } from './api'

/**
 * One card in the opening sequence: a face-down back until its turn comes,
 * then the card flipping in behind a glow tinted by its own rarity.
 *
 * The glow is a decoration on top of the rarity label the card already
 * carries, never the only thing saying how good the pull was.
 */
export function RevealCard({ card, revealed }: { card: Card; revealed: boolean }) {
	const style = RARITY[card.rarity]

	if (!revealed) {
		return (
			<li
				aria-hidden
				className="flex h-[122px] w-32 items-center justify-center rounded-lg border-2 border-white/10 bg-gradient-to-br from-slate-700/70 to-slate-900/70"
			>
				<span className="h-10 w-10 rounded-full border-2 border-white/20" />
			</li>
		)
	}

	return (
		<li className="[perspective:600px]" style={{ ['--glow' as string]: style.glow }}>
			<div className="animate-card-reveal">
				<div className="animate-glow-pulse rounded-lg">
					<CardFace card={card} />
				</div>
			</div>
		</li>
	)
}
