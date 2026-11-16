import { readFlag, writeFlag } from '../ui'

/**
 * Sound effects, and the switch that silences them.
 *
 * Audio is the one thing a game must never force on a player: it is remembered
 * per browser, on by default, and read at the moment a sound is asked for so a
 * change in the options panel takes effect immediately.
 */
const SOUND_KEY = 'pokemon:sound'

export function soundEnabled(): boolean {
	return readFlag(SOUND_KEY, true)
}

export function setSoundEnabled(enabled: boolean): void {
	writeFlag(SOUND_KEY, enabled)
}

/**
 * Drop a file at this path in `public/` and it is played instead of the
 * synthesized jingle below — that is the hook for the real centre theme, which
 * is not shipped with the game because it is not ours to redistribute.
 */
const HEAL_TRACK = '/audio/center-heal.mp3'

/** One shared context: browsers cap how many a page may create. */
let context: AudioContext | null = null

function audio(): AudioContext | null {
	// Built lazily, inside the click that wants a sound: a context created
	// before any gesture starts suspended under every autoplay policy.
	try {
		const Ctor =
			window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
		if (!Ctor) return null
		context ??= new Ctor()
		// A context can be suspended again when the tab is backgrounded.
		if (context.state === 'suspended') void context.resume().catch(() => undefined)
		return context
	} catch {
		// No audio device, audio disabled by policy, or a context limit reached.
		return null
	}
}

function note(ctx: AudioContext, frequency: number, at: number, length: number, level: number) {
	const osc = ctx.createOscillator()
	const gain = ctx.createGain()
	// A triangle wave is the closest thing to the chiptune register this is
	// meant to echo, without the harshness of a square at full volume.
	osc.type = 'triangle'
	osc.frequency.value = frequency
	// Shaped rather than switched: an abrupt start or stop on a gain node is
	// heard as a click, which would be the loudest part of the jingle.
	gain.gain.setValueAtTime(0, at)
	gain.gain.linearRampToValueAtTime(level, at + 0.012)
	gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
	osc.connect(gain).connect(ctx.destination)
	osc.start(at)
	osc.stop(at + length + 0.02)
}

/**
 * The centre's healing chime: Sol La♭ Sol Mi♭ | Fa Sol Fa Ré | Mi♭ Fa Mi♭ Do |
 * Ré Mi♭ Ré Si♭ — four falling groups in E♭ major, each one a step below the
 * last, ending settled on the tonic's fifth.
 */
const SIXTEENTH = 0.11

const G5 = 783.99
const AB5 = 830.61
const EB5 = 622.25
const F5 = 698.46
const D5 = 587.33
const C5 = 523.25
const BB4 = 466.16

const PHRASE: number[] = [
	G5, AB5, G5, EB5,
	F5, G5, F5, D5,
	EB5, F5, EB5, C5,
	D5, EB5, D5, BB4,
]

const MELODY: [frequency: number, beat: number, length: number][] = PHRASE.map((frequency, index) => [
	frequency,
	index * SIXTEENTH,
	// The note closing each group of four rings on a little, which is what
	// makes the phrase read as four gestures rather than sixteen taps.
	index % 4 === 3 ? SIXTEENTH * 1.8 : SIXTEENTH * 0.9,
])

function synthesize(): void {
	const ctx = audio()
	if (!ctx) return
	const start = ctx.currentTime + 0.02
	for (const [frequency, beat, length] of MELODY) {
		note(ctx, frequency, start + beat, length, 0.14)
	}
}

let track: HTMLAudioElement | null = null

/**
 * The healing jingle, played when the team is handed over at the counter.
 *
 * Must be called from the click itself, which is what makes it allowed to make
 * noise at all. Every failure is silent on purpose: a missing file, a codec the
 * browser lacks, an autoplay policy, a machine with no audio output — none of
 * them is a reason to interrupt a player who came here to heal their team.
 */
export function playHealJingle(): void {
	if (!soundEnabled()) return

	try {
		track ??= new Audio(HEAL_TRACK)
		track.volume = 0.5
		track.currentTime = 0
		// Rejects when the file is absent or undecodable, which is the normal
		// case until someone adds one — so that is where the synth takes over.
		void track.play().catch(() => synthesize())
	} catch {
		synthesize()
	}
}
