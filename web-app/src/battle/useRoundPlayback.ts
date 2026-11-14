import { useCallback, useEffect, useRef, useState } from 'react'

import type { Battle, RoundLog, Side, TurnEvent } from './api'

/**
 * Replays a resolved round as a sequence of beats.
 *
 * The server answers a whole round at once — both attacks, the damage, any
 * knockout. Rendering that answer directly makes health bars teleport and
 * knockouts happen off-screen. So the authoritative result is kept aside and
 * the view is walked through it: dash, impact, damage, faint, next Pokémon.
 *
 * The replay only ever *catches up* to the server's numbers. It never invents
 * one: each beat subtracts a damage figure the server already decided, and
 * the final state is overwritten with the server's own at the end.
 */

/** How long each beat of one attack lasts, in milliseconds. */
const DASH = 330
const IMPACT = 520
const FAINT = 620
const ENTER = 260

export type Attacking = 'player' | 'master' | null

export interface FloatingHit {
	id: number
	side: 'player' | 'master'
	damage: number
	critical: boolean
	type: string
}

export interface PlaybackView {
	/** HP per team member, mirroring the server's teams. */
	playerHp: number[]
	masterHp: number[]
	playerActive: number
	masterActive: number
	/** Who is mid-dash, if anyone. */
	attacking: Attacking
	/** Who is being hit right now. */
	impactOn: 'player' | 'master' | null
	/** Who is collapsing right now. */
	fainting: 'player' | 'master' | null
	/** Who just came onto the field. */
	entering: 'player' | 'master' | null
	shake: boolean
	hits: FloatingHit[]
	/** True while a round is being replayed; the attack button stays disabled. */
	playing: boolean
}

function snapshot(battle: Battle): Pick<PlaybackView, 'playerHp' | 'masterHp' | 'playerActive' | 'masterActive'> {
	return {
		playerHp: battle.player.team.map((f) => f.hp),
		masterHp: battle.master.team.map((f) => f.hp),
		playerActive: battle.player.active,
		masterActive: battle.master.active,
	}
}

const idle = {
	attacking: null,
	impactOn: null,
	fainting: null,
	entering: null,
	shake: false,
} as const

export function useRoundPlayback(battle: Battle | null) {
	const [view, setView] = useState<PlaybackView>(() => ({
		playerHp: [],
		masterHp: [],
		playerActive: 0,
		masterActive: 0,
		...idle,
		hits: [],
		playing: false,
	}))

	const timers = useRef<ReturnType<typeof setTimeout>[]>([])
	const hitId = useRef(0)

	const clear = useCallback(() => {
		timers.current.forEach(clearTimeout)
		timers.current = []
	}, [])

	useEffect(() => clear, [clear])

	/** Jump straight to a battle's state, no animation — used on open and resume. */
	const reset = useCallback(
		(next: Battle) => {
			clear()
			setView({ ...snapshot(next), ...idle, hits: [], playing: false })
		},
		[clear],
	)

	/**
	 * Walk through a round.
	 *
	 * `after` is the server's post-round battle, applied at the end so any
	 * drift between the replay and the truth is corrected rather than kept.
	 */
	const play = useCallback(
		(round: RoundLog, after: Battle, reduced: boolean) => {
			clear()

			if (reduced || round.events.length === 0) {
				setView({ ...snapshot(after), ...idle, hits: [], playing: false })
				return
			}

			setView((current) => ({ ...current, ...idle, playing: true }))

			let at = 0
			const schedule = (delay: number, run: () => void) => {
				timers.current.push(setTimeout(run, delay))
			}

			for (const event of round.events) {
				const target: 'player' | 'master' = event.side === 'player' ? 'master' : 'player'

				// Wind up and dash.
				schedule(at, () => setView((v) => ({ ...v, ...idle, attacking: event.side, playing: true })))

				// Contact: damage lands, the bar drains, the number flies off.
				schedule(at + DASH, () => {
					hitId.current += 1
					const id = hitId.current
					setView((v) => applyHit(v, event, target, id))
					// The number outlives the flinch, so it is cleaned up on its own.
					schedule(at + DASH + 1000, () =>
						setView((v) => ({ ...v, hits: v.hits.filter((hit) => hit.id !== id) })),
					)
				})

				schedule(at + DASH + IMPACT, () =>
					setView((v) => ({ ...v, attacking: null, impactOn: null, shake: false })),
				)

				at += DASH + IMPACT

				if (event.fainted) {
					schedule(at, () => setView((v) => ({ ...v, fainting: target })))
					at += FAINT

					if (event.replacedBy) {
						schedule(at, () => setView((v) => sendOutNext(v, target)))
						at += ENTER
					}
				}
			}

			// Settle on the server's numbers.
			schedule(at + 120, () =>
				setView((v) => ({ ...snapshot(after), ...idle, hits: v.hits, playing: false })),
			)
		},
		[clear],
	)

	useEffect(() => {
		if (battle && view.playerHp.length === 0) reset(battle)
		// Only to seed the very first render; later states come from `play`.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [battle])

	return { view, play, reset }
}

function applyHit(
	view: PlaybackView,
	event: TurnEvent,
	target: 'player' | 'master',
	id: number,
): PlaybackView {
	const hp = target === 'player' ? [...view.playerHp] : [...view.masterHp]
	const active = target === 'player' ? view.playerActive : view.masterActive
	hp[active] = Math.max(0, hp[active] - event.damage)

	return {
		...view,
		...(target === 'player' ? { playerHp: hp } : { masterHp: hp }),
		impactOn: target,
		shake: event.critical || event.damage >= 100,
		hits: [
			...view.hits,
			{ id, side: target, damage: event.damage, critical: event.critical, type: event.move.type },
		],
	}
}

/**
 * Send out the next Pokemon on a side.
 *
 * Deliberately the same rule the server uses — the first team member still
 * standing — so the replay lands on the same Pokemon the server already chose.
 */
function sendOutNext(view: PlaybackView, side: 'player' | 'master'): PlaybackView {
	const hp = side === 'player' ? view.playerHp : view.masterHp
	const next = hp.findIndex((value) => value > 0)
	if (next === -1) return { ...view, fainting: null }

	return {
		...view,
		fainting: null,
		entering: side,
		...(side === 'player' ? { playerActive: next } : { masterActive: next }),
	}
}

/** Merge the replayed HP back onto a side for rendering. */
export function sideWithPlaybackHp(side: Side, hp: number[], active: number) {
	return {
		...side,
		active,
		team: side.team.map((fighter, index) => ({ ...fighter, hp: hp[index] ?? fighter.hp })),
	}
}
