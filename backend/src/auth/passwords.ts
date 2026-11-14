import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/**
 * Password hashing with scrypt, straight from `node:crypto` — no dependency,
 * and memory-hard by design, which is what makes a stolen dump expensive to
 * crack. Cost parameters are stored with the hash so they can be raised later
 * without invalidating existing passwords.
 */
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const COST = 16384 // N
const BLOCK_SIZE = 8 // r
const PARALLELISM = 1 // p

/** `scrypt$N$r$p$salt$hash`, all hex. */
export function hashPassword(plain: string): string {
	const salt = randomBytes(SALT_LENGTH)
	const derived = scryptSync(plain, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELISM })
	return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('hex'), derived.toString('hex')].join('$')
}

/** Constant-time check. Any malformed stored value is treated as "no match". */
export function verifyPassword(plain: string, stored: string): boolean {
	const parts = stored.split('$')
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false

	const [, n, r, p, saltHex, hashHex] = parts
	const expected = Buffer.from(hashHex, 'hex')
	if (expected.length === 0) return false

	try {
		const derived = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length, {
			N: Number(n),
			r: Number(r),
			p: Number(p),
		})
		return timingSafeEqual(derived, expected)
	} catch {
		return false
	}
}
