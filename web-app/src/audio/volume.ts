import { useSyncExternalStore } from 'react'

import { readFlag, readNumber, writeNumber } from '../ui'

/**
 * The two volumes, and who to tell when they move.
 *
 * Two knobs rather than one, because the two kinds of sound are heard very
 * differently: the loop runs for the whole session and is the first thing a
 * player turns down, while an effect is short feedback on a press and is worth
 * keeping even when the music is off. Both live here rather than in a React
 * context so that non-React code — the looping element, the healing jingle —
 * can read them at the moment it makes noise, while the options panel still
 * subscribes and re-renders like any other component.
 *
 * Volumes are `0…1`. Zero is a real value, not a disabled state: muting is
 * dragging the slider to the bottom, and the preference remembers it.
 */
export type Channel = 'music' | 'effects'

const KEYS: Record<Channel, string> = {
	music: 'pokemon:volume:music',
	effects: 'pokemon:volume:effects',
}

/**
 * The loop sits under everything for the whole session, so it starts lower
 * than the effects, which only ever interrupt for a moment.
 */
const DEFAULTS: Record<Channel, number> = {
	music: 0.35,
	effects: 0.6,
}

/** The on/off switch this pair of sliders replaced. */
const LEGACY_SOUND_KEY = 'pokemon:sound'

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(1, Math.max(0, value))
}

function initial(channel: Channel): number {
	const stored = readNumber(KEYS[channel], Number.NaN)
	if (Number.isFinite(stored)) return clamp(stored)
	// Nothing stored under the new key: a player who had already silenced the
	// game with the old toggle should still find it silent, not suddenly loud.
	return readFlag(LEGACY_SOUND_KEY, true) ? DEFAULTS[channel] : 0
}

const volumes: Record<Channel, number> = {
	music: initial('music'),
	effects: initial('effects'),
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function getVolume(channel: Channel): number {
	return volumes[channel]
}

export function setVolume(channel: Channel, value: number): void {
	const next = clamp(value)
	if (next === volumes[channel]) return
	volumes[channel] = next
	writeNumber(KEYS[channel], next)
	for (const listener of listeners) listener()
}

/** The current volume of one channel, re-rendering the caller when it moves. */
export function useVolume(channel: Channel): number {
	return useSyncExternalStore(
		subscribe,
		() => volumes[channel],
		() => DEFAULTS[channel],
	)
}

/**
 * Run `effect` now and again whenever a volume changes — how the looping
 * element keeps its own gain in step with the slider while it plays.
 */
export function onVolumeChange(effect: () => void): () => void {
	return subscribe(effect)
}
