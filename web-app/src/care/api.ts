import { API_URL, readToken } from '../auth/api'
import type { TeamMember } from '../teams'

/** Mirrored from `backend/src/care/center.ts`. */
export interface CareState {
	/** Where the centre stands, for the panel to point at. */
	at: { x: number; y: number } | null
	/** True when the player is close enough to hand the team over. */
	atCounter: boolean
	members: TeamMember[]
	/** Hurt and not yet being treated. */
	wounded: TeamMember[]
	/** Currently being treated, and so out of the roster. */
	inCare: TeamMember[]
	/** One unit of care in milliseconds, as the server counts it. */
	unitMs: number
	/** What treating each wounded member would cost, in ms, keyed by card. */
	estimates: Record<string, number>
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

/** Leave the wounded at the centre. With no list, the whole team's wounded. */
export function admitCards(cardIds?: string[]): Promise<AdmitResult> {
	return send<AdmitResult>('/care/admit', {
		method: 'POST',
		body: JSON.stringify(cardIds ? { cardIds } : {}),
	})
}
