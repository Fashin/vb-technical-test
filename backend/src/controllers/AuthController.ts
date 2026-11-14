import { Router } from 'express'

import { bearerToken, rateLimit, requireAuth } from '../auth/middleware'
import { issueSession, revokeSession } from '../auth/sessions'
import { createUser, findByEmail, normalizeEmail, toPublicUser, touchLastSeen } from '../auth/users'
import { verifyPassword } from '../auth/passwords'

export const AuthController = Router()

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN = 8
const PASSWORD_MAX = 200
const NAME_MAX = 24

/** 10 attempts per quarter hour per IP, shared by register and login. */
const credentialsLimiter = rateLimit(10, 15 * 60 * 1000)

function invalid(message: string) {
	return { error: { code: 'INVALID_PAYLOAD', message } }
}

AuthController.post('/register', credentialsLimiter, (req, res) => {
	const { email, password, displayName } = req.body ?? {}

	if (typeof email !== 'string' || email.length > 160 || !EMAIL.test(email.trim())) {
		return res.status(400).json(invalid('Enter a valid email address'))
	}
	if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
		return res.status(400).json(invalid(`Password must be at least ${PASSWORD_MIN} characters`))
	}

	const name = typeof displayName === 'string' ? displayName.trim().slice(0, NAME_MAX) : ''
	if (!name) return res.status(400).json(invalid('Choose a display name'))

	if (findByEmail(email)) {
		return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'That email already has an account' } })
	}

	const user = createUser(normalizeEmail(email), password, name)
	return res.status(201).json({ user: toPublicUser(user), token: issueSession(user.id) })
})

AuthController.post('/login', credentialsLimiter, (req, res) => {
	const { email, password } = req.body ?? {}
	if (typeof email !== 'string' || typeof password !== 'string') {
		return res.status(400).json(invalid('Email and password are required'))
	}

	const user = findByEmail(email)
	// Same answer whether the email is unknown or the password is wrong, so the
	// endpoint cannot be used to find out which emails have an account.
	if (!user || !verifyPassword(password, user.password_hash)) {
		return res
			.status(401)
			.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong email or password' } })
	}

	touchLastSeen(user.id)
	return res.status(200).json({ user: toPublicUser(user), token: issueSession(user.id) })
})

/**
 * Auto-login probe: the web app calls this on boot with whatever token it kept.
 * A valid one slides its 30-day window, so an active player is never asked to
 * sign in again.
 */
AuthController.get('/me', requireAuth, (req, res) => {
	touchLastSeen(req.user!.id)
	return res.status(200).json({ user: toPublicUser(req.user!) })
})

AuthController.post('/logout', (req, res) => {
	const token = bearerToken(req)
	if (token) revokeSession(token)
	return res.status(204).end()
})
