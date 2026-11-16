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
