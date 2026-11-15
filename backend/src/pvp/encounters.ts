import { randomUUID } from 'crypto'

import { positionOf } from '../world/world'

/**
 * Invitations between two players standing next to each other.
 *
 * Held in memory, like the world itself: an invitation that does not survive a
 * restart is the correct behaviour, not a limitation — nobody should come back
 * online to a duel request from an hour ago.
 *
 * The distance is checked when the invitation is sent, when it is answered and
 * again when the encounter actually resolves. An invitation is never a
 * laissez-passer: walking away cancels it, whatever the client believes.
 */

export type EncounterKind = 'duel' | 'trade'

/** Invitations expire on their own; nobody is left staring at a stale prompt. */
const TTL_MS = 45_000

/** How close two players must stand, in tiles, on each axis. */
export const REACH = 2

export interface Invitation {
	id: string
	kind: EncounterKind
	fromUserId: string
	fromName: string
	toUserId: string
	createdAt: number
}

const invitations = new Map<string, Invitation>()

function expire(): void {
	const now = Date.now()
	for (const [id, invitation] of invitations) {
		if (now - invitation.createdAt > TTL_MS) invitations.delete(id)
	}
}

/** True when both players are standing within reach of one another. */
export function withinReach(a: string, b: string): boolean {
	const here = positionOf(a)
	const there = positionOf(b)
	if (!here || !there) return false
	return Math.abs(here.x - there.x) <= REACH && Math.abs(here.y - there.y) <= REACH
}

export type InviteResult =
	| { ok: true; invitation: Invitation }
	| { ok: false; reason: 'SELF' | 'TOO_FAR' | 'PENDING' }

/**
 * Offer a duel or a trade to a neighbour.
 *
 * One pending invitation per sender at a time, so a player cannot spam the
 * whole plaza, and the previous one is dropped rather than queued.
 */
export function invite(
	fromUserId: string,
	fromName: string,
	toUserId: string,
	kind: EncounterKind,
): InviteResult {
	expire()
	if (fromUserId === toUserId) return { ok: false, reason: 'SELF' }
	if (!withinReach(fromUserId, toUserId)) return { ok: false, reason: 'TOO_FAR' }

	for (const [id, pending] of invitations) {
		// Already waiting on this exact person: do not pile another one on.
		if (pending.fromUserId === fromUserId && pending.toUserId === toUserId) return { ok: false, reason: 'PENDING' }
		if (pending.fromUserId === fromUserId) invitations.delete(id)
	}

	const invitation: Invitation = {
		id: randomUUID(),
		kind,
		fromUserId,
		fromName,
		toUserId,
		createdAt: Date.now(),
	}
	invitations.set(invitation.id, invitation)
	return { ok: true, invitation }
}

/** Read and consume an invitation addressed to this player. */
export function take(invitationId: string, byUserId: string): Invitation | null {
	expire()
	const invitation = invitations.get(invitationId)
	if (!invitation || invitation.toUserId !== byUserId) return null
	invitations.delete(invitationId)
	return invitation
}

/** Drop everything involving a player — used when they leave the world. */
export function forget(userId: string): Invitation[] {
	const dropped: Invitation[] = []
	for (const [id, invitation] of invitations) {
		if (invitation.fromUserId !== userId && invitation.toUserId !== userId) continue
		invitations.delete(id)
		dropped.push(invitation)
	}
	return dropped
}
