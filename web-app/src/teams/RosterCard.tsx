import { FiStar } from 'react-icons/fi'

import { RARITY, type Card } from '../boosters'
import { spriteUrlFor } from '../map'
import { LevelBadge } from '../progression'
import { typeStyle } from '../pokemon'

/**
 * One card in the roster the team is picked from.
 *
 * It carries the level, because level is what the choice turns on: two copies
 * of the same Pokémon are not the same asset, and picking the right one used
 * to mean closing this panel and going to look at the collection.
 *
 * The sprite is given real room — 64px, the size it is drawn at — because a
 * roster is picked from by recognising Pokémon on sight. Shrinking the tiles
 * fits more of them on screen and makes every one of them useless.
 *
 * The star is its own button rather than part of the tile — a button inside a
 * button is not valid markup, and starring a card must never be a near-miss of
 * adding it to the team.
 */
export function RosterCard({
	card,
	picked,
	disabled,
	favourite,
	onAdd,
	onToggleFavourite,
}: {
	card: Card
	/** Already in the team being edited. */
	picked: boolean
	disabled: boolean
	favourite: boolean
	onAdd: () => void
	onToggleFavourite: () => void
}) {
	return (
		<li className="relative">
			<button
				type="button"
				disabled={disabled || picked}
				onClick={onAdd}
				title={picked ? 'Déjà dans l’équipe' : `Ajouter ${card.name}`}
				className={`flex h-36 w-28 flex-col items-center justify-start rounded-lg border-2 bg-black/30 pb-1.5 pt-2 transition disabled:cursor-not-allowed ${
					picked
						? 'border-emerald-400/60 opacity-40'
						: `${RARITY[card.rarity].ring} hover:border-emerald-400/70 disabled:opacity-30`
				}`}
			>
				<img
					src={spriteUrlFor(card.pokedexId)}
					alt=""
					loading="lazy"
					className={`h-16 w-16 [image-rendering:pixelated] ${card.fainted ? 'opacity-40 grayscale' : ''}`}
				/>
				<span className="mt-0.5 w-full truncate px-1 text-center text-sm capitalize text-slate-200">
					{card.name}
				</span>
				<LevelBadge level={card.level} className="mt-1" />
				<span className="mt-1 flex w-full justify-center gap-0.5 px-1">
					{card.types.slice(0, 2).map((type) => (
						<span
							key={type}
							className={`truncate rounded px-1 text-[10px] font-medium leading-4 ${typeStyle(type).chip}`}
						>
							{typeStyle(type).label}
						</span>
					))}
				</span>
			</button>

			<button
				type="button"
				onClick={onToggleFavourite}
				aria-pressed={favourite}
				title={favourite ? 'Retirer des favoris' : 'Mettre en favori'}
				aria-label={`${favourite ? 'Retirer' : 'Mettre'} ${card.name} ${
					favourite ? 'des' : 'en'
				} favoris`}
				className="absolute left-0.5 top-0.5 rounded p-1 transition hover:bg-white/10"
			>
				<FiStar
					className={`h-4 w-4 ${
						favourite ? 'fill-amber-300 text-amber-300' : 'text-slate-500 hover:text-slate-300'
					}`}
				/>
			</button>
		</li>
	)
}
