import { API_URL, readToken } from '../auth/api'
import type { Mentor } from '../progression'
import type { TeamMember } from '../teams'

/** Mirrored from `backend/src/care/center.ts`. */
export interface CareState {
	/** Where the centre stands, for the panel to point at. */
	at: { x: number; y: number } | null
	/** True when the player is close enough to hand the team over. */
	atCounter: boolean
	/** Every card the centre can look at — all teams, plus benched wounded. */
	members: TeamMember[]
	/** Hurt and not yet being treated. */
	wounded: TeamMember[]
	/** Currently being treated, and so out of the roster. */
	inCare: TeamMember[]
	/** One unit of care in milliseconds, as the server counts it. */
	unitMs: number
	/** What treating each wounded member would cost, in ms, keyed by card. */
	estimates: Record<string, number>
	/**
	 * Team mates at the account's level cap — they shorten everyone else's stay.
	 *
	 * The centre has no camp to read a ceiling off, so the tier in play is the
	 * cap the badges allow. The estimates above already have the discount in
	 * them; `relief` is only there to explain where it came from.
	 */
	mentors: Mentor[]
	/** The factor the wait was divided by, keyed by card. Absent means none. */
	relief: Record<string, number>
	/** The teams each card belongs to, keyed by card. Empty when benched. */
	teams: Record<string, string[]>
}

export interface AdmitResult {
	admitted: { cardId: string; name: string; healedAt: number }[]
	skipped: number
	care: CareState
}

export class CareError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message)
		this.name = 'CareError'
	}
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = readToken()
	const response = await fetch(`${API_URL}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...init.headers,
		},
	})

	const body = await response.json().catch(() => null)
	if (!response.ok) {
		const error = (body as { error?: { code: string; message: string } } | null)?.error
		throw new CareError(error?.code ?? 'NETWORK', error?.message ?? 'Serveur injoignable')
	}
	return body as T
}

export function fetchCare(): Promise<{ care: CareState }> {
	return send<{ care: CareState }>('/care')
}

/** Leave the wounded at the centre. With no list, every wounded card. */
export function admitCards(cardIds?: string[]): Promise<AdmitResult> {
	return send<AdmitResult>('/care/admit', {
		method: 'POST',
		body: JSON.stringify(cardIds ? { cardIds } : {}),
	})
}
