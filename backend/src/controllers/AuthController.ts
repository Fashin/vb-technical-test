import { Router } from 'express'

import { bearerToken, rateLimit, requireAuth } from '../auth/middleware'
import { issueSession, revokeAllSessions, revokeSession } from '../auth/sessions'
import {
	createUser,
	deleteUser,
	findByEmail,
	findById,
	normalizeEmail,
	saveAppearance,
	toPublicUser,
	touchLastSeen,
	updateDisplayName,
	updatePassword,
} from '../auth/users'
import { disconnectUser } from '../realtime'
import { sanitizeAppearance } from '../appearance/appearance'
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

/**
 * Save the trainer's look. The payload is clamped to the known palettes before
 * it is stored, so a crafted request cannot make another player's client
 * render something undefined.
 */
AuthController.put('/appearance', requireAuth, (req, res) => {
	const appearance = sanitizeAppearance(req.body?.appearance)
	saveAppearance(req.user!.id, appearance)
	return res.status(200).json({ appearance })
})

/** Rename the trainer. The name is cosmetic, so no password is required. */
AuthController.put('/display-name', requireAuth, (req, res) => {
	const raw = req.body?.displayName
	const displayName = typeof raw === 'string' ? raw.trim().slice(0, NAME_MAX) : ''
	if (!displayName) return res.status(400).json(invalid('Choisis un pseudo'))

	updateDisplayName(req.user!.id, displayName)
	return res.status(200).json({ user: toPublicUser({ ...req.user!, display_name: displayName }) })
})

/**
 * Change the password.
 *
 * The current one is required even though the caller is already authenticated:
 * it is what stops someone who walked up to an unlocked screen from taking the
 * account over. Every existing session is then revoked — locking the other
 * sessions out is the point of changing a password — and the caller gets a
 * fresh token so they are not signed out of the tab they are using.
 */
AuthController.put('/password', credentialsLimiter, requireAuth, (req, res) => {
	const { currentPassword, newPassword } = req.body ?? {}

	if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
		return res.status(400).json(invalid('Mot de passe actuel et nouveau requis'))
	}
	if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
		return res.status(400).json(invalid(`Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères`))
	}

	const user = findById(req.user!.id)
	if (!user || !verifyPassword(currentPassword, user.password_hash)) {
		return res
			.status(401)
			.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Mot de passe actuel incorrect' } })
	}
	if (verifyPassword(newPassword, user.password_hash)) {
		return res.status(400).json(invalid('Le nouveau mot de passe doit être différent'))
	}

	updatePassword(user.id, newPassword)
	revokeAllSessions(user.id)
	return res.status(200).json({ token: issueSession(user.id) })
})

/**
 * Delete the account for good.
 *
 * Guarded by the password, because nothing here is recoverable: the cards, the
 * boosters and the character go with the row, through ON DELETE CASCADE.
 */
AuthController.delete('/me', credentialsLimiter, requireAuth, async (req, res) => {
	const { password } = req.body ?? {}
	if (typeof password !== 'string') {
		return res.status(400).json(invalid('Mot de passe requis'))
	}

	const user = findById(req.user!.id)
	if (!user || !verifyPassword(password, user.password_hash)) {
		return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Mot de passe incorrect' } })
	}

	deleteUser(user.id)
	// Its character must stop walking around now that the row is gone.
	await disconnectUser(user.id)
	return res.status(204).end()
})

AuthController.post('/logout', (req, res) => {
	const token = bearerToken(req)
	if (token) revokeSession(token)
	return res.status(204).end()
})
