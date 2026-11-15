/**
 * Level and experience, drawn the same way everywhere.
 *
 * A Pokémon's level now decides what it hits for and how much it can take, so
 * it has to be legible on every surface that shows a Pokémon at all: the
 * boosters, the collection, the team, the arena and the camps. One pair of
 * components rather than five variants of a grey pill.
 */

/** Level ceiling — mirrored from `backend/src/progression/levels.ts`. */
export const MAX_LEVEL = 100

export function LevelBadge({
	level,
	className = '',
}: {
	level: number
	className?: string
}) {
	const maxed = level >= MAX_LEVEL
	return (
		<span
			title={maxed ? 'Niveau maximum' : `Niveau ${level}`}
			className={`rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${
				maxed ? 'bg-amber-400/90 text-amber-950' : 'bg-slate-900/80 text-slate-100 ring-1 ring-white/20'
			} ${className}`}
		>
			Nv.&nbsp;{level}
		</span>
	)
}

/**
 * What a Pokémon has left, as a share of its maximum.
 *
 * Damage is carried between fights, so this bar is not a battle detail: it is
 * what tells the player, from the collection screen, that a card needs a trip
 * to the healing centre before it can be fielded again.
 */
export function HealthBar({
	health,
	className = '',
}: {
	health: number
	className?: string
}) {
	const ratio = Math.min(1, Math.max(0, health))
	const tone = ratio > 0.5 ? 'bg-emerald-500' : ratio > 0.2 ? 'bg-amber-400' : 'bg-red-500'
	return (
		<div
			className={`h-2 overflow-hidden rounded-full bg-black/50 ${className}`}
			title={`${Math.round(ratio * 100)} % de PV`}
			role="presentation"
		>
			<div className={`h-full rounded-full ${tone}`} style={{ width: `${ratio * 100}%` }} />
		</div>
	)
}

/**
 * Progress inside the current level.
 *
 * `ratio` comes from the server, which owns the curve: computing it here from
 * the raw experience would mean a second copy of that formula.
 */
export function XpBar({
	ratio,
	toNextLevel,
	className = '',
}: {
	ratio: number
	/** Experience still owed; 0 at the ceiling, where the bar reads as full. */
	toNextLevel?: number
	className?: string
}) {
	const filled = Math.min(1, Math.max(0, ratio))
	return (
		<div
			className={`h-1.5 overflow-hidden rounded-full bg-black/50 ${className}`}
			title={toNextLevel ? `${toNextLevel} XP avant le niveau suivant` : undefined}
			role="presentation"
		>
			<div
				className="h-full rounded-full bg-sky-400 transition-[width] duration-700 ease-out"
				style={{ width: `${filled * 100}%` }}
			/>
		</div>
	)
}
