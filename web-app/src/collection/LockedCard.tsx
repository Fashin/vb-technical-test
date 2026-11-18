import { spriteUrlFor } from '../map'

/**
 * A Pokémon the player has never pulled.
 *
 * The same box as a real card tile — same width, same ring, same stacked
 * rows — so the grid stays a grid and the gap in the collection reads as a
 * slot waiting to be filled rather than as a different kind of object.
 *
 * Everything identifying is withheld on purpose: the name and the level are
 * "?", and the sprite is painted flat black so only the silhouette survives.
 * The shape is the one clue the player gets, which is the point — recognising
 * it is the small reward for knowing the Pokédex.
 *
 * `brightness-0` rather than a separate silhouette asset: it collapses every
 * colour to black while keeping the alpha channel, so the outline is exactly
 * the sprite's own. No stats, no bars, nothing that would leak the species.
 */
export function LockedCard({ pokedexId, className = '' }: { pokedexId: number; className?: string }) {
	return (
		<div
			className={`relative flex w-32 flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/15 bg-black/20 p-2 ${className}`}
		>
			<img
				src={spriteUrlFor(pokedexId)}
				alt=""
				aria-hidden
				className="h-20 w-20 opacity-70 brightness-0 [image-rendering:pixelated]"
				loading="lazy"
			/>
			<span className="mt-1 w-full text-center text-sm font-medium tracking-widest text-slate-500">???</span>
			<div className="mt-1 flex min-h-11 flex-col items-center justify-center gap-1">
				<span className="whitespace-nowrap rounded bg-white/5 px-1.5 py-0.5 text-xs font-medium text-slate-500">
					?
				</span>
				<span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-bold text-slate-500">Nv.&nbsp;?</span>
			</div>
		</div>
	)
}
