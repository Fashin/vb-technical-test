import { GiTeacher } from 'react-icons/gi'

/**
 * The mentoring bonus, as one number.
 *
 * Mirrored from `backend/src/progression/mentors.ts`: a team mate that has
 * topped out the current tier coaches everyone below its level, cumulatively
 * and in proportion to the gap it closes. The server applies the very same
 * factor to a training session's experience and to a stay at the healing
 * centre, so the two panels print it with the same component — reading "× 2,4"
 * at the camp means the trip to the centre is 2,4 times shorter too.
 */

/** `1.85` as `× 1,9` — a multiplier, in French. */
function formatFactor(factor: number): string {
	return `× ${factor.toFixed(1).replace('.', ',')}`
}

/**
 * Drawn only when there is something to show.
 *
 * A factor of 1 is "no mentor above this one", which is the normal case for
 * the strongest Pokémon of a team; a badge saying "× 1,0" would read as a
 * penalty rather than as the absence of a bonus.
 */
export function MentorBadge({ factor, label }: { factor: number; label?: string }) {
	if (!Number.isFinite(factor) || factor < 1.05) return null

	return (
		<span
			className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-200"
			title="Bonus de mentorat : les Pokémon de l’équipe qui ont fini le palier en cours entraînent ceux qui sont sous leur niveau."
		>
			<GiTeacher aria-hidden className="h-3.5 w-3.5" />
			{formatFactor(factor)}
			{label && <span className="text-violet-300/80">{label}</span>}
		</span>
	)
}
