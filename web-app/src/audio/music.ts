import { getVolume, onVolumeChange } from './volume'

/**
 * The overworld loop.
 *
 * One `<audio loop>` kept alive for the whole session rather than a Web Audio
 * graph: the file is a plain seamless loop with no mixing or scheduling to do,
 * and the element streams it instead of holding the decoded megabyte in memory.
 *
 * Two things make this harder than "call play()". A browser refuses to start
 * audio before the player has interacted with the page, and that refusal is a
 * rejected promise, not an error worth showing anyone — so a first attempt
 * that fails arms a one-shot listener and the loop starts on the first click,
 * key or touch instead. And a volume of zero pauses the element rather than
 * playing it silently, so a player who muted the music is not paying for a
 * stream they cannot hear.
 */
const MUSIC_TRACK = '/audio/background-loop.mp3'

let element: HTMLAudioElement | null = null
/** Whether the game currently wants the loop running. */
let wanted = false
/** Set while a gesture listener is armed, so only one is ever waiting. */
let armed = false
let unsubscribe: (() => void) | null = null

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const

function track(): HTMLAudioElement | null {
	if (element) return element
	try {
		const audio = new Audio(MUSIC_TRACK)
		audio.loop = true
		audio.preload = 'auto'
		// Nothing else on the page plays music, so a browser tab's media
		// controls showing this as the page's audio is exactly right.
		audio.volume = getVolume('music')
		element = audio
		return audio
	} catch {
		// No audio support at all: the game is perfectly playable in silence.
		return null
	}
}

function armGesture(): void {
	if (armed) return
	armed = true
	const unlock = () => {
		armed = false
		for (const name of GESTURES) window.removeEventListener(name, unlock)
		// Only if the loop is still wanted: the player may have left the map,
		// or muted the music, between the refusal and the first click.
		if (wanted) apply()
	}
	for (const name of GESTURES) window.addEventListener(name, unlock, { once: true, passive: true })
}

/** Bring the element in line with what the game wants and what the slider says. */
function apply(): void {
	const audio = track()
	if (!audio) return

	const volume = getVolume('music')
	audio.volume = volume

	if (!wanted || volume === 0) {
		audio.pause()
		return
	}

	if (!audio.paused) return
	void audio.play().catch(() => {
		// Either no gesture yet, or the file is missing or undecodable. Waiting
		// for a gesture covers the first and costs nothing in the others.
		armGesture()
	})
}

/**
 * Start the loop, and keep it in step with the music slider.
 *
 * Returns the matching stop, so the caller that mounted the world is the one
 * that silences it. Safe to call when the browser has not allowed audio yet.
 */
export function startMusic(): () => void {
	wanted = true
	unsubscribe ??= onVolumeChange(apply)
	apply()

	return () => {
		wanted = false
		unsubscribe?.()
		unsubscribe = null
		const audio = element
		if (!audio) return
		audio.pause()
		// Back to the top: the next session starts at the beginning of the
		// loop rather than halfway through a phrase.
		try {
			audio.currentTime = 0
		} catch {
			/* not seekable yet; it will start from wherever it is */
		}
	}
}
