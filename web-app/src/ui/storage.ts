/**
 * Small on/off preferences remembered in this browser.
 *
 * `localStorage` throws rather than returning null in private browsing, when
 * site data is blocked, and inside a sandboxed iframe — so every access is
 * guarded and a failure simply means the preference lasts for this session.
 * A setting worth a round trip to the server belongs on the account instead;
 * this is for the ones that describe the machine in front of the player.
 */
export function readFlag(key: string, fallback = false): boolean {
	try {
		const stored = window.localStorage.getItem(key)
		return stored === null ? fallback : stored === '1'
	} catch {
		return fallback
	}
}

export function writeFlag(key: string, value: boolean): void {
	try {
		window.localStorage.setItem(key, value ? '1' : '0')
	} catch {
		/* the preference holds for this session; nothing else to do */
	}
}

/**
 * A list of ids remembered in this browser — favourites, dismissed hints, and
 * the like. Same guarantees as the flags above: a failure to read or write is
 * silent and simply means the list does not outlive the session.
 *
 * Anything that is not an array of strings is treated as absent rather than
 * repaired: storage is shared with whatever else runs on this origin, and a
 * surprising shape there must not break a screen.
 */
export function readList(key: string): string[] {
	try {
		const stored = window.localStorage.getItem(key)
		if (!stored) return []
		const parsed: unknown = JSON.parse(stored)
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
	} catch {
		return []
	}
}

export function writeList(key: string, values: string[]): void {
	try {
		window.localStorage.setItem(key, JSON.stringify(values))
	} catch {
		/* the list holds for this session; nothing else to do */
	}
}

/**
 * A number remembered in this browser — a volume, a zoom level, a count.
 *
 * Same guarantees as the flags above. Anything that is not a finite number is
 * treated as absent rather than coerced: `Number('')` is 0, and a volume
 * silently reading as "muted" because storage held an empty string would look
 * like a broken speaker, not a broken preference.
 */
export function readNumber(key: string, fallback: number): number {
	try {
		const stored = window.localStorage.getItem(key)
		if (stored === null) return fallback
		const parsed = Number(stored)
		return Number.isFinite(parsed) ? parsed : fallback
	} catch {
		return fallback
	}
}

export function writeNumber(key: string, value: number): void {
	try {
		window.localStorage.setItem(key, String(value))
	} catch {
		/* the preference holds for this session; nothing else to do */
	}
}
