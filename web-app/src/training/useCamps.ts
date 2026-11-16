import { useCallback, useEffect, useState } from 'react'

import { fetchCamps, type Camp } from './api'

/**
 * The camps as the server measures them against the active team.
 *
 * Lives outside `TrainingPanel` because the map needs them too: the bands are
 * painted over the huts (`map/CampSigns.tsx`) so a player can read which camp
 * is theirs from across the world instead of walking in to find out.
 *
 * No `teamId` here on purpose — the signs are read while walking, and the team
 * being considered in the panel is a choice made inside the panel. The active
 * team is what the map is about.
 *
 * `refresh` is for after a session: training moves levels, and a sign still
 * reading "niveaux 1 – 25, 4 Pokémon" for a team that has outgrown the place
 * would be worse than no sign at all.
 */
export function useCamps(enabled: boolean): { camps: Camp[]; refresh: () => void } {
	const [camps, setCamps] = useState<Camp[]>([])
	const [attempt, setAttempt] = useState(0)
	const refresh = useCallback(() => setAttempt((n) => n + 1), [])

	useEffect(() => {
		if (!enabled) return
		let cancelled = false
		fetchCamps()
			.then(({ camps: found }) => !cancelled && setCamps(found))
			// A failed lookup simply leaves the huts unlabelled: the map, the
			// walking and the camps themselves all keep working without it.
			.catch(() => undefined)
		return () => {
			cancelled = true
		}
	}, [enabled, attempt])

	return { camps, refresh }
}
