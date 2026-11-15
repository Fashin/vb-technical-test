/**
 * Fixed-window counters, kept in memory.
 *
 * One implementation for the two places that need to say "not that often":
 * the HTTP middleware (`auth/middleware.ts`) and the realtime handlers, which
 * have no request and no response to hang a middleware on. Both throttle the
 * same kind of thing — work this server pays for — so both should count it the
 * same way.
 *
 * Single-process and reset by a restart, like everything else held in memory
 * here. Enough to blunt a script; a real deployment puts this in Redis or at
 * the edge.
 */
export interface Window {
	/** Spend one unit for `key`. False when the budget is already gone. */
	take(key: string): boolean
	/** Look without spending — for reporting a wait rather than refusing. */
	remaining(key: string): number
}

export function fixedWindow(limit: number, windowMs: number): Window {
	const hits = new Map<string, { count: number; resetAt: number }>()

	// Expired entries are swept rather than left to grow with every new key.
	const sweep = setInterval(() => {
		const now = Date.now()
		for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key)
	}, windowMs)
	sweep.unref()

	const current = (key: string) => {
		const entry = hits.get(key)
		return entry && entry.resetAt > Date.now() ? entry : null
	}

	return {
		take(key) {
			const entry = current(key)
			if (!entry) {
				hits.set(key, { count: 1, resetAt: Date.now() + windowMs })
				return true
			}
			if (entry.count >= limit) return false

			entry.count += 1
			return true
		},

		remaining(key) {
			const entry = current(key)
			return entry ? Math.max(0, limit - entry.count) : limit
		},
	}
}
