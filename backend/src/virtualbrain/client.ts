import { VIRTUALBRAIN_API_KEY, hasVirtualBrain } from '../config'

/**
 * VirtualBrain chatbot client.
 *
 * Two things here are not obvious from the API docs and drive the design:
 *
 *  - the access token lives one hour, so it has to be refreshed mid-session;
 *  - refreshing **rotates** the refresh token, so the new one must replace the
 *    old one. Keeping the original would lock the server out an hour in.
 *
 * The tokens are held in memory only. They are derived from the API key, which
 * lives in `.env`, and nothing here is ever sent to the browser.
 */
const BASE_URL = 'https://chatbot-api.getvirtualbrain.com'

/** Refresh this long before the token actually expires. */
const REFRESH_MARGIN_MS = 60_000

/** The API answers in well under this; past it a battle turn should fail loudly. */
const REQUEST_TIMEOUT_MS = 30_000

interface Credentials {
	accessToken: string
	refreshToken: string
	chatbotId: string
	expiresAt: number
}

let credentials: Credentials | null = null
/** In-flight authentication, so a burst of turns does not trigger a burst of exchanges. */
let pending: Promise<Credentials> | null = null

export class VirtualBrainError extends Error {
	constructor(
		public readonly code: 'NOT_CONFIGURED' | 'AUTH_FAILED' | 'REQUEST_FAILED',
		message: string,
	) {
		super(message)
		this.name = 'VirtualBrainError'
	}
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
	const response = await fetch(`${BASE_URL}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})

	if (!response.ok) {
		throw new VirtualBrainError('AUTH_FAILED', `${path} answered ${response.status}`)
	}
	return (await response.json()) as T
}

async function exchangeKey(): Promise<Credentials> {
	const data = await postJson<{
		accessToken: string
		refreshToken: string
		expiresIn: number
		chatbotId: string
	}>('/v1/auth/api-key/token', { apiKey: VIRTUALBRAIN_API_KEY })

	return {
		accessToken: data.accessToken,
		refreshToken: data.refreshToken,
		chatbotId: data.chatbotId,
		expiresAt: Date.now() + data.expiresIn * 1000,
	}
}

async function refresh(current: Credentials): Promise<Credentials> {
	const data = await postJson<{ accessToken: string; refreshToken: string; expiresIn: number; chatbotId: string }>(
		'/v1/auth/api-key/refresh',
		{ refreshToken: current.refreshToken, chatbotId: current.chatbotId },
	)

	return {
		// The rotated refresh token replaces the old one, which is now dead.
		accessToken: data.accessToken,
		refreshToken: data.refreshToken,
		chatbotId: data.chatbotId,
		expiresAt: Date.now() + data.expiresIn * 1000,
	}
}

async function authenticate(): Promise<Credentials> {
	if (!hasVirtualBrain()) {
		throw new VirtualBrainError('NOT_CONFIGURED', 'VIRTUALBRAIN_API_KEY is not set')
	}

	if (credentials && credentials.expiresAt - REFRESH_MARGIN_MS > Date.now()) return credentials
	if (pending) return pending

	pending = (async () => {
		try {
			// A failed refresh is not fatal: the key can always mint a fresh pair.
			credentials = credentials ? await refresh(credentials).catch(() => exchangeKey()) : await exchangeKey()
			return credentials
		} finally {
			pending = null
		}
	})()

	return pending
}

export interface Answer {
	text: string
	/** Session to replay on the next call so the chatbot remembers this battle. */
	sessionId: string | null
}

/**
 * Ask the chatbot, reading its streamed answer to the end.
 *
 * The response is `text/plain` sent in chunks. A battle turn needs the whole
 * thing before it can be parsed, so it is buffered here; the parts worth
 * showing live are streamed on to the browser by the caller.
 */
export async function ask(query: string, sessionId?: string | null): Promise<Answer> {
	const creds = await authenticate()

	const response = await fetch(`${BASE_URL}/v1/open-completion/${creds.chatbotId}/query`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${creds.accessToken}`,
			...(sessionId ? { 'x-session-id': sessionId } : {}),
		},
		body: JSON.stringify({ query }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})

	if (!response.ok) {
		throw new VirtualBrainError('REQUEST_FAILED', `completion answered ${response.status}`)
	}

	return {
		text: await response.text(),
		// Echoed back by the server when it opened a session for us.
		sessionId: response.headers.get('x-session-id') ?? sessionId ?? null,
	}
}
