import { spriteUrlFor } from '../map'
import type { Card } from './api'
import { RARITY } from './rarity'

interface CardFaceProps {
	card: Pick<Card, 'pokedexId' | 'name' | 'rarity'>
	/** Shown as "×N" when the player owns several copies. */
	count?: number
}

/** One card tile, shared by the booster reveal and the collection. */
export function CardFace({ card, count = 1 }: CardFaceProps) {
	const style = RARITY[card.rarity]
	return (
		<li className={`relative flex w-28 flex-col items-center rounded-lg border-2 bg-black/40 p-2 ${style.ring}`}>
			<img
				src={spriteUrlFor(card.pokedexId)}
				alt=""
				className="h-16 w-16 [image-rendering:pixelated]"
				loading="lazy"
			/>
			<span className="mt-1 w-full truncate text-center text-xs capitalize text-slate-100">{card.name}</span>
			<span className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${style.chip}`}>{style.label}</span>
			{count > 1 && (
				<span className="absolute -right-2 -top-2 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-900">
					×{count}
				</span>
			)}
		</li>
	)
}
