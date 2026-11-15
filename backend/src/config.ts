import 'dotenv/config'

/**
 * Configuration, read once from the environment.
 *
 * `dotenv/config` is imported here and this module is imported first by
 * `app.ts`, so every other module sees a populated `process.env` no matter
 * when it reads it. Node's own `--env-file` would avoid the dependency, but
 * on this version it aborts when the file is missing — a fresh clone should
 * still boot and tell you what to put in `.env`.
 */

/**
 * VirtualBrain API key, `vb_ak_...`.
 *
 * Server-side only. It is exchanged for a short-lived access token and never
 * reaches the browser: the battle stream is proxied through this backend
 * precisely so the key stays here.
 */
export const VIRTUALBRAIN_API_KEY = process.env.VIRTUALBRAIN_API_KEY ?? ''

export const PORT = Number(process.env.PORT) || 3001

/**
 * Origins allowed to call this API, comma-separated in `CORS_ORIGINS`.
 *
 * Reflecting whatever `Origin` arrives is the default a boilerplate reaches
 * for and the one that bites: any page on the internet could then call this
 * API from a visitor's browser. The dev server's two addresses are the
 * default; a deployment sets its own.
 */
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean)

/** True when the chatbot can be reached; the arena says so rather than failing silently. */
export function hasVirtualBrain(): boolean {
	return VIRTUALBRAIN_API_KEY.startsWith('vb_ak_')
}

/** Logged once at boot: a missing key must be obvious, not a mystery 401 later. */
export function reportConfig(): void {
	if (hasVirtualBrain()) {
		console.log('[config] VirtualBrain key loaded')
		return
	}
	console.warn(
		'[config] VIRTUALBRAIN_API_KEY is missing or malformed — battles will be unavailable.' +
			' Copy backend/.env.example to backend/.env and fill it in.',
	)
}
