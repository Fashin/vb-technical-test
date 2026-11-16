import { useCallback, useMemo, useState } from 'react'

import { useAuth } from '../auth'
import { readList, writeList } from '../ui'

/**
 * Cards the player starred, remembered in this browser.
 *
 * Deliberately local rather than a column on `cards`: a favourite is a note to
 * self about which copy you reach for when building a team, it changes nothing
 * the server arbitrates, and keeping it here means starring a card costs no
 * round trip and cannot fail. The trade is that the stars do not follow the
 * player to another machine — worth it for a convenience of this size; a
 * server field is the upgrade path if it ever needs to.
 *
 * Keyed per account, because one browser is often shared: the stars of the
 * person who played before must not show up on someone else's roster.
 */
export interface Favourites {
	has: (cardId: string) => boolean
	toggle: (cardId: string) => void
	count: number
}

export function useFavourites(): Favourites {
	const { user } = useAuth()
	const key = user ? `pokelist.favourites.${user.id}` : null

	const [ids, setIds] = useState<string[]>(() => (key ? readList(key) : []))

	const set = useMemo(() => new Set(ids), [ids])

	const toggle = useCallback(
		(cardId: string) => {
			setIds((current) => {
				const next = current.includes(cardId)
					? current.filter((id) => id !== cardId)
					: [...current, cardId]
				if (key) writeList(key, next)
				return next
			})
		},
		[key],
	)

	return {
		has: useCallback((cardId: string) => set.has(cardId), [set]),
		toggle,
		count: set.size,
	}
}
