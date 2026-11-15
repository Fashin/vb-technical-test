import { useCallback, useEffect, useRef, useState } from 'react'

import type { Battle, Side } from './api'

/**
 * Plays a resolved battle back as one continuous scene.
 *
 * The server answers with the whole fight — every round, every attack, the
 * commentary the model wrote for each of them. Rendering that answer directly
 * would show nothing but the final score, so the authoritative result is kept
 * aside and the view is walked through it: lunge, impact, damage, knockout,
 * next Pokémon, next round, without ever stopping for the player.
 *
 * Text and movement share one timeline. A line appears as its attack starts,
 * is typed out while the sprite travels, and the next attack only begins once
 * the sentence has had time to be read — which is what keeps the commentary
 * and the animation describing the same thing at the same moment.
 *
 * The replay only ever *catches up* to the server's numbers. It never invents
 * one: each beat subtracts a damage figure the server already decided, and the
 * final state is overwritten with the server's own at the end.
 */

/** How long each beat of one attack lasts, in milliseconds. */
const DASH = 330
const IMPACT = 520
const FAINT = 620
const ENTER = 300
/** Breathing room between two beats. */
const GAP = 170

/** Reading time granted to a line: roughly a comfortable pace, within bounds. */
const MS_PER_CHAR = 27
const MIN_READ = 900
const MAX_READ = 2600

function readingMs(text: string): number {
	return Math.min(MAX_READ, Math.max(MIN_READ, text.length * MS_PER_CHAR))
}

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
	/** True while the battle is being played; the arena stays in charge. */
	playing: boolean
	/** The line being told right now. */
	caption: string
	/** Changes with every caption, so the typewriter restarts on repeats. */
	captionKey: number
	/** Rounds told so far: the written log reveals itself at the same pace. */
	round: number
}

const idle = {
	attacking: null,
	impactOn: null,
	fainting: null,
	entering: null,
	shake: false,
} as const

const empty: PlaybackView = {
	playerHp: [],
	masterHp: [],
	playerActive: 0,
	masterActive: 0,
	...idle,
	hits: [],
	playing: false,
	caption: '',
	captionKey: 0,
	round: 0,
}

/** Both teams at full health: where every replay starts. */
function freshHp(side: Side): number[] {
	return side.team.map((fighter) => fighter.maxHp)
}

/** The battle as the server left it — the state the replay settles on. */
function settled(battle: Battle, caption: string, captionKey: number): PlaybackView {
	return {
		playerHp: battle.player.team.map((fighter) => fighter.hp),
		masterHp: battle.master.team.map((fighter) => fighter.hp),
		playerActive: battle.player.active,
		masterActive: battle.master.active,
		...idle,
		hits: [],
		playing: false,
		caption,
		captionKey,
		round: battle.round,
	}
}

export function useBattlePlayback(battle: Battle | null) {
	const [view, setView] = useState<PlaybackView>(empty)

	const timers = useRef<ReturnType<typeof setTimeout>[]>([])
	const captions = useRef(0)

	const clear = useCallback(() => {
		timers.current.forEach(clearTimeout)
		timers.current = []
	}, [])

	useEffect(() => clear, [clear])

	/** Show a battle at its starting line, no animation — used on open. */
	const reset = useCallback(
		(next: Battle) => {
			clear()
			setView({
				...empty,
				playerHp: freshHp(next.player),
				masterHp: freshHp(next.master),
			})
		},
		[clear],
	)

	/**
	 * Walk through a whole battle.
	 *
	 * `reduced` is honoured by handing over the result directly: players who
	 * asked for less movement get the outcome, not the show.
	 */
	const play = useCallback(
		(resolved: Battle, reduced: boolean) => {
			clear()
			captions.current += 1

			if (reduced || resolved.log.length === 0) {
				setView(settled(resolved, resolved.intro ?? '', captions.current))
				return
			}

			// The replay simulates the fight forward from full health; the server's
			// own numbers are the teams' *final* state, so they cannot seed it.
			const hp = { player: freshHp(resolved.player), master: freshHp(resolved.master) }
			const active = { player: 0, master: 0 }
			const team = { player: resolved.player.team, master: resolved.master.team }

			let caption = captions.current
			let hitId = 0
			let at = 0

			const schedule = (delay: number, run: () => void) => {
				timers.current.push(setTimeout(run, delay))
			}
			const say = (text: string, patch: Partial<PlaybackView> = {}) => {
				caption += 1
				const key = caption
				schedule(at, () =>
					setView((current) => ({ ...current, ...idle, ...patch, caption: text, captionKey: key, playing: true })),
				)
			}

			setView({
				playerHp: [...hp.player],
				masterHp: [...hp.master],
				playerActive: 0,
				masterActive: 0,
				...idle,
				hits: [],
				playing: true,
				caption: '',
				captionKey: caption,
				round: 0,
			})

			if (resolved.intro) {
				say(resolved.intro)
				at += readingMs(resolved.intro)
			}

			for (const round of resolved.log) {
				for (const event of round.events) {
					const target = event.side === 'player' ? ('master' as const) : ('player' as const)
					// The server says who struck and who was hit. The replay used to
					// work it out from its own idea of the field, which held only as
					// long as a faint was the sole way to leave it.
					const struck = event.targetIndex
					const striker = event.sourceIndex
					active[event.side] = striker
					active[target] = struck

					// Wind up and dash, with the line that goes with it.
					say(event.line || `${team[event.side][striker].name} attaque !`, {
						attacking: event.side,
						round: round.round,
						playerActive: active.player,
						masterActive: active.master,
					})

					// Contact: damage lands, the bar drains, the number flies off.
					hp[target][struck] = Math.max(0, hp[target][struck] - event.damage)
					const drained = [...hp[target]]
					hitId += 1
					const hit: FloatingHit = {
						id: hitId,
						side: target,
						damage: event.damage,
						critical: event.critical,
						type: event.move.type,
					}

					schedule(at + DASH, () => {
						setView((current) => ({
							...current,
							...(target === 'player' ? { playerHp: drained } : { masterHp: drained }),
							impactOn: target,
							shake: event.critical || event.damage >= 100,
							hits: [...current.hits, hit],
						}))
					})
					// The number outlives the flinch, so it is cleaned up on its own.
					schedule(at + DASH + 1000, () =>
						setView((current) => ({ ...current, hits: current.hits.filter((other) => other.id !== hit.id) })),
					)
					schedule(at + DASH + IMPACT, () =>
						setView((current) => ({ ...current, attacking: null, impactOn: null, shake: false })),
					)

					// The sentence is given time to be read before the next blow.
					at += Math.max(DASH + IMPACT, readingMs(event.line)) + GAP

					if (!event.fainted) continue

					say(`${team[target][struck].name} est K.O. !`, { fainting: target })
					at += FAINT

					// Both replacements come from the server's own indices: the one
					// sent out to answer the knockout, and — in a training session —
					// the winner stepping aside for the next of its own team.
					if (event.replacedBy) {
						active[target] = event.activeAfter[target]
						const entered = active[target]
						say(`${event.replacedBy} entre en jeu !`, {
							entering: target,
							...(target === 'player' ? { playerActive: entered } : { masterActive: entered }),
						})
						at += ENTER + 500
					}

					if (event.handedOverTo) {
						active[event.side] = event.activeAfter[event.side]
						const relieved = active[event.side]
						say(`${team[event.side][striker].name} passe la main à ${event.handedOverTo} !`, {
							entering: event.side,
							...(event.side === 'player' ? { playerActive: relieved } : { masterActive: relieved }),
						})
						at += ENTER + 500
					}
				}
			}

			// Settle on the server's numbers, whatever the replay drifted to.
			caption += 1
			const last = caption
			schedule(at + GAP, () => setView(settled(resolved, '', last)))
			captions.current = caption
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

/** Merge the replayed HP back onto a side for rendering. */
export function sideWithPlaybackHp(side: Side, hp: number[], active: number) {
	return {
		...side,
		active,
		team: side.team.map((fighter, index) => ({ ...fighter, hp: hp[index] ?? fighter.hp })),
	}
}
