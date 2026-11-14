import type { NextFunction, Request, Response } from 'express'

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
	const hits = new Map<string, { count: number; resetAt: number }>()

	const sweep = setInterval(() => {
		const now = Date.now()
		for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key)
	}, windowMs)
	sweep.unref()

	return (req: Request, res: Response, next: NextFunction): void => {
		const key = req.ip ?? 'unknown'
		const now = Date.now()
		const entry = hits.get(key)

		if (!entry || entry.resetAt <= now) {
			hits.set(key, { count: 1, resetAt: now + windowMs })
			next()
			return
		}

		entry.count += 1
		if (entry.count > limit) {
			res.status(429).json({
				error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts, try again later' },
			})
			return
		}
		next()
	}
}
