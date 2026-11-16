import { FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi'

import { RARITY } from '../boosters'
import { spriteUrlFor } from '../map'
import { HealthBar, LevelBadge, XpBar } from '../progression'
import type { TeamMember } from './api'

/**
 * One place in the battle order.
 *
 * The order is not decoration: slot 1 is the Pokémon that walks into the arena
 * first, so the first tile says so in words rather than leaving the player to
 * infer it from the reading direction.
 *
 * Two ways to move a Pokémon, because one is never enough: dragging, which is
 * what anyone reaches for on a desktop, and a pair of arrows, which is what
 * works on a touch screen and with a keyboard. Dragging alone would make the
 * ordering unusable on a phone — the screen the rest of this app supports.
 */
export function TeamSlot({
	member,
	index,
	total,
	dragging,
	dropTarget,
	busy,
	onRemove,
	onMove,
	onDragStart,
	onDragEnter,
	onDrop,
	onDragEnd,
}: {
	member: TeamMember | null
	index: number
	/** How many Pokémon are actually in the team, for the arrows' limits. */
	total: number
	dragging: boolean
	dropTarget: boolean
	busy: boolean
	onRemove: () => void
	onMove: (to: number) => void
	onDragStart: () => void
	onDragEnter: () => void
	onDrop: () => void
	onDragEnd: () => void
}) {
	if (!member) {
		return (
			<li className="flex h-44 w-28 items-center justify-center rounded-lg border-2 border-dashed border-white/15 text-sm text-slate-600">
				vide
			</li>
		)
	}

	return (
		<li
			draggable={!busy}
			onDragStart={onDragStart}
			onDragEnter={onDragEnter}
			onDragOver={(event) => {
				// Without this the browser refuses the drop outright.
				event.preventDefault()
				event.dataTransfer.dropEffect = 'move'
			}}
			onDrop={(event) => {
				event.preventDefault()
				onDrop()
			}}
			onDragEnd={onDragEnd}
			className={`relative flex h-44 w-28 cursor-grab flex-col items-center rounded-lg border-2 bg-black/40 px-1.5 pb-1 pt-5 transition active:cursor-grabbing ${
				RARITY[member.rarity].ring
			} ${dragging ? 'opacity-40' : ''} ${dropTarget ? 'ring-2 ring-emerald-400' : ''}`}
		>
			{/* Position first, because it is what this screen is for. */}
			<span
				className={`absolute left-1 top-1 rounded px-1.5 text-[11px] font-bold tabular-nums ${
					index === 0 ? 'bg-emerald-400 text-emerald-950' : 'bg-white/10 text-slate-300'
				}`}
				title={index === 0 ? 'Commence le combat' : `Position ${index + 1}`}
			>
				{index + 1}
			</span>

			<button
				type="button"
				onClick={onRemove}
				disabled={busy}
				title={`Retirer ${member.name}`}
				aria-label={`Retirer ${member.name} de l’équipe`}
				className="absolute right-0.5 top-0.5 rounded p-0.5 text-slate-500 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
			>
				<FiX className="h-3.5 w-3.5" />
			</button>

			<img
				src={spriteUrlFor(member.pokedexId)}
				alt=""
				className={`h-16 w-16 [image-rendering:pixelated] ${member.fainted ? 'opacity-40 grayscale' : ''}`}
			/>
			<span className="w-full truncate text-center text-xs capitalize text-slate-200">{member.name}</span>
			<LevelBadge level={member.level} className="mt-1" />
			<XpBar ratio={member.ratio} toNextLevel={member.toNextLevel} className="mt-1 w-full" />
			{member.health < 1 && <HealthBar health={member.health} className="mt-0.5 w-full" />}
			{member.inCare && <span className="text-[11px] font-medium text-red-300">en soins</span>}

			{/* The keyboard and touch path to the same reordering. */}
			<div className="mt-auto flex w-full items-center justify-between pt-1">
				<button
					type="button"
					disabled={busy || index === 0}
					onClick={() => onMove(index - 1)}
					aria-label={`Avancer ${member.name} d’une place`}
					className="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-20"
				>
					<FiChevronLeft className="h-4 w-4" />
				</button>
				<button
					type="button"
					disabled={busy || index >= total - 1}
					onClick={() => onMove(index + 1)}
					aria-label={`Reculer ${member.name} d’une place`}
					className="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-20"
				>
					<FiChevronRight className="h-4 w-4" />
				</button>
			</div>
		</li>
	)
}
