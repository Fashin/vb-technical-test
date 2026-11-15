import { spriteUrlFor } from '../map'
import { HealthBar, LevelBadge, XpBar } from '../progression'
import type { Card } from './api'
import { RARITY } from './rarity'

interface CardFaceProps {
	/**
	 * The progression fields are optional so that a card drawn by an older
	 * client — or a face rendered from a partial record — still renders.
	 */
	card: Pick<Card, 'pokedexId' | 'name' | 'rarity'> &
		Partial<Pick<Card, 'level' | 'ratio' | 'toNextLevel' | 'health' | 'inCare' | 'fainted'>>
	/** Shown as "×N" when the player owns several copies. */
	count?: number
}

/**
 * One card tile, shared by the booster reveal and the collection.
 *
 * Renders a plain block, not a list item: the reveal wraps it in animation
 * layers, so the `<li>` belongs to whichever list is doing the rendering.
 */
export function CardFace({ card, count = 1 }: CardFaceProps) {
	const style = RARITY[card.rarity]
	return (
		<div className={`relative flex w-32 flex-col items-center rounded-lg border-2 bg-black/40 p-2 ${style.ring}`}>
			<img
				src={spriteUrlFor(card.pokedexId)}
				alt=""
				className={`h-20 w-20 [image-rendering:pixelated] ${card.fainted ? 'opacity-40 grayscale' : ''}`}
				loading="lazy"
			/>
			{card.inCare && (
				<span className="absolute left-1 top-1 rounded bg-red-400/90 px-1 py-0.5 text-[11px] font-bold text-red-950">
					soins
				</span>
			)}
			<span className="mt-1 w-full truncate text-center text-sm capitalize text-slate-100">{card.name}</span>
			<div className="mt-1 flex items-center gap-1">
				<span className={`rounded px-1.5 py-0.5 text-xs font-medium ${style.chip}`}>{style.label}</span>
				{card.level !== undefined && <LevelBadge level={card.level} />}
			</div>
			{card.level !== undefined && (
				<XpBar ratio={card.ratio ?? 0} toNextLevel={card.toNextLevel} className="mt-1.5 w-full" />
			)}
			{card.health !== undefined && card.health < 1 && (
				<HealthBar health={card.health} className="mt-1 w-full" />
			)}
			{count > 1 && (
				<span className="absolute -right-2 -top-2 rounded-full bg-white px-1.5 py-0.5 text-xs font-bold text-slate-900">
					×{count}
				</span>
			)}
		</div>
	)
}
