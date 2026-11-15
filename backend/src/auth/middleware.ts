import type { NextFunction, Request, Response } from 'express'

import { fixedWindow } from '../util/throttle'
import { verifySession } from './sessions'
import type { UserRow } from './users'

declare module 'express-serve-static-core' {
	interface Request {
		/** Set by `requireAuth`; absent on public routes. */
		user?: UserRow
		token?: string
	}
}

/** `Authorization: Bearer <token>`, or null. */
export function bearerToken(req: Request): string | null {
	const header = req.get('authorization')
	if (!header) return null
	const [scheme, value] = header.split(' ')
	if (!value || scheme.toLowerCase() !== 'bearer') return null
	return value.trim() || null
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
	const token = bearerToken(req)
	const user = verifySession(token)
	if (!token || !user) {
		res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in again' } })
		return
	}
	req.user = user
	req.token = token
	next()
}

/**
 * Fixed-window limiter, per IP, kept in memory.
 *
 * Enough to blunt online password guessing on a single-process server. It is
 * not a defence against a distributed attack, and it resets on restart — a
 * real deployment puts this in Redis or at the edge.
 */
export function rateLimit(limit: number, windowMs: number) {
	return limiter(limit, windowMs, (req) => req.ip ?? 'unknown')
}

/**
 * The same window, counted per account.
 *
 * What needs protecting is not always a network address: one logged-in player
 * hammering a route that costs the server a language-model call is the case
 * this exists for, and they would do it from a single IP anyway. Must be
 * mounted after `requireAuth`.
 */
export function rateLimitUser(limit: number, windowMs: number) {
	return limiter(limit, windowMs, (req) => req.user?.id ?? req.ip ?? 'unknown')
}

function limiter(limit: number, windowMs: number, keyOf: (req: Request) => string) {
	const window = fixedWindow(limit, windowMs)

	return (req: Request, res: Response, next: NextFunction): void => {
		if (window.take(keyOf(req))) return next()

		res.status(429).json({
			error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts, try again later' },
		})
	}
}
