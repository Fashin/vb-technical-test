import { useEffect, useRef, useState } from 'react'

import { spriteUrlFor } from '../map'
import { TrainerPortrait, type Appearance } from '../trainer'

/**
 * The opening of a fight: two trainers walk on, say their piece, and throw
 * their first ball.
 *
 * This exists for one reason: the server resolves a whole battle in a single
 * request — the chatbot writes every round and every line before anything is
 * thrown — and that takes real seconds, sometimes tens of them. A spinner for
 * that long reads as a broken screen. So the wait is spent the way the games
 * spend it, on the part of a battle that is pure ceremony anyway.
 *
 * It changes nothing about the fight. It is played over the same panel, from
 * data the client already has, and it ends on a loop (`standoff`) that can be
 * held for as long as the server needs. `onReady` fires when that loop is
 * reached, which is the caller's cue that it may cut to the real thing.
 */

export interface IntroTrainer {
	name: string
	appearance: Appearance
	/**
	 * Pokedex id of the Pokemon this side leads with, thrown out at the end.
	 *
	 * Null when the side's lead is not known — a duel whose roster the server
	 * could not state. The throw is then skipped rather than faked with a
	 * Pokemon the fight will not field.
	 */
	lead: number | null
}

/** What the player's trainer shouts. One is drawn per battle. */
const PLAYER_LINES = [
	'Je vais gagner, et tu le sais déjà !',
	'On a trop travaillé pour perdre ici !',
	'Mon équipe est prête. À nous de jouer !',
	'Pas question de reculer aujourd’hui !',
	'Tu vas voir ce qu’on vaut !',
	'Allez, montrons-leur ce qu’on sait faire !',
	'Donne-moi tout ce que tu as, j’en veux plus !',
	'Ce combat, il est pour nous !',
	'Un pas de plus vers le sommet !',
	'J’ai attendu ce moment-là.',
]

/** What the trainer on the other side shouts back. */
const OPPONENT_LINES = [
	'Tu es loin d’être prêt pour moi.',
	'Je n’ai pas perdu depuis longtemps. Ça ne va pas changer.',
	'Montre-moi ce que tu sais faire… si tu peux.',
	'Tu as du courage. Pas assez, mais du courage.',
	'Ce combat sera court.',
	'Mon équipe va t’apprendre la patience.',
	'Beaucoup ont essayé avant toi.',
	'J’espère que tu as de quoi te soigner.',
	'Approche. Tu vas comprendre.',
	'Je vais gagner, comme toujours.',
]

function pick(lines: readonly string[]): string {
	return lines[Math.floor(Math.random() * lines.length)]
}

/**
 * Whether the stage has room for its full-size layout.
 *
 * The stage is laid out in pixels — a trainer, a throwing hand and a Pokemon
 * at fixed offsets from the edge, with the ball's arc cut to match — because
 * the ball's keyframe cannot be expressed as a fraction of a parent it does
 * not fill. On a phone those offsets put the two Pokemon on top of each other
 * in the middle, so below Tailwind's `sm` everything shrinks: the offsets and
 * the Pokemon through `--intro-reach` and the `sm:` classes, the trainer
 * through this, since its size is a number the canvas is drawn at rather than
 * a style.
 */
const WIDE = '(min-width: 640px)'

function useWideStage(): boolean {
	const [wide, setWide] = useState(
		() => typeof window !== 'undefined' && (window.matchMedia?.(WIDE).matches ?? true),
	)

	useEffect(() => {
		if (!window.matchMedia) return
		const list = window.matchMedia(WIDE)
		const update = () => setWide(list.matches)

		update()
		// `addEventListener` on a MediaQueryList is unsupported on Safari < 14.
		if (list.addEventListener) {
			list.addEventListener('change', update)
			return () => list.removeEventListener('change', update)
		}
		list.addListener(update)
		return () => list.removeListener(update)
	}, [])

	return wide
}

/**
 * The beats, in order. `standoff` is not one of them: it is what follows the
 * last, and it has no end — the server decides when it stops.
 */
const BEATS = [
	{ name: 'enter', ms: 2200 },
	{ name: 'opponent', ms: 2600 },
	{ name: 'player', ms: 2600 },
	{ name: 'throw', ms: 2600 },
] as const

/**
 * Ten seconds from the first step to the standoff.
 *
 * Paced to be watched rather than sat through: the walk is a walk, each line
 * stays up long enough to be read without hurrying, and the ball has an arc
 * instead of a flick. The durations in `tailwind.config.js` — `intro-enter`,
 * `intro-ball`, `intro-exit` — are cut to these beats, so slowing one down
 * means slowing both.
 */

type Phase = (typeof BEATS)[number]['name'] | 'standoff'

/** How long one stride of the walk cycle is held, in milliseconds. */
const STRIDE_MS = 200

/**
 * Milliseconds into the `throw` beat at which the ball opens.
 *
 * The same as the ball's own flight, so it bursts where it lands rather than
 * in mid-air or after a pause on the ground.
 */
const RELEASE_MS = 1100

function Pokeball() {
	return (
		<span
			aria-hidden
			className="relative -ml-[7px] -mt-[7px] block h-3.5 w-3.5 overflow-hidden rounded-full border border-black/70 bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]"
		>
			<span className="absolute inset-x-0 top-0 h-1/2 bg-red-500" />
			<span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/70" />
			<span className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/70 bg-white" />
		</span>
	)
}

/**
 * One trainer's half of the stage.
 *
 * The opponent's half is the player's mirrored, and that mirror is the whole
 * trick: inside it "forward" is still +x, so a single set of keyframes walks
 * the player in from the left and the opponent in from the right, and the
 * profile art — which is drawn facing right — turns to face the middle on both
 * sides. Only two things have to undo the mirror: the Pokemon sprite, which
 * gets the same flip the battlefield gives the player's, and the speech, which
 * is drawn in a layer of its own above all this.
 */
function IntroSide({
	trainer,
	phase,
	frame,
	released,
	flip,
	wide,
	rails,
}: {
	trainer: IntroTrainer
	phase: Phase
	frame: number
	released: boolean
	flip: boolean
	/** See `useWideStage`: the trainer's size is a number, not a class. */
	wide: boolean
	/** Vertical placement of the trainer, the throwing hand, and the Pokemon. */
	rails: { trainer: string; hand: string; pokemon: string }
}) {
	let walk = ''
	if (phase === 'enter') walk = 'animate-intro-enter'
	else if (released) walk = 'animate-intro-exit'
	else if (phase === 'throw') walk = 'animate-intro-throw'

	return (
		<div className={`absolute inset-y-0 w-1/2 ${flip ? 'right-0 -scale-x-100' : 'left-0'}`}>
			{phase !== 'standoff' && (
				<div className={`absolute left-[14px] ${rails.trainer} ${walk}`}>
					<TrainerPortrait
						appearance={trainer.appearance}
						scale={wide ? 4 : 3}
						view="side"
						frame={frame}
						label={trainer.name}
						bleed
					/>
				</div>
			)}

			{trainer.lead !== null && (
				<>
					{phase === 'throw' && !released && (
						<div className={`absolute left-[32px] sm:left-[48px] ${rails.hand} animate-intro-ball`}>
							<Pokeball />
						</div>
					)}

					{(released || phase === 'standoff') && (
						<div className={`absolute left-[var(--intro-reach)] ${rails.pokemon} h-16 w-16 sm:h-24 sm:w-24`}>
							{phase === 'throw' && (
								<span
									aria-hidden
									className="absolute left-0 top-0 block h-16 w-16 animate-pack-burst rounded-full sm:h-24 sm:w-24"
									style={{
										background:
											'radial-gradient(circle, #ffffff 0%, #fde68a 35%, rgba(253,230,138,0.35) 55%, transparent 72%)',
									}}
								/>
							)}
							{/* Flipped the way the battlefield flips the player's sprite; on
							    the mirrored half the two flips cancel, which is what leaves
							    the opponent's Pokemon facing the player's. */}
							<span className="block -scale-x-100">
								<img
									key={phase}
									src={spriteUrlFor(trainer.lead)}
									alt=""
									className={`h-16 w-16 [image-rendering:pixelated] sm:h-24 sm:w-24 ${
										phase === 'throw' ? 'animate-intro-pop' : 'animate-intro-bob'
									}`}
								/>
							</span>
						</div>
					)}
				</>
			)}
		</div>
	)
}

/** A line of dialogue, drawn outside the mirrored halves so it reads forwards. */
function Bubble({ text, tone, className }: { text: string; tone: 'player' | 'opponent'; className: string }) {
	const colors =
		tone === 'player'
			? 'border-emerald-400/50 bg-emerald-950/85 text-emerald-100'
			: 'border-amber-400/50 bg-amber-950/85 text-amber-100'

	return (
		<p
			className={`absolute max-w-[66%] animate-intro-say sm:max-w-[58%] rounded-xl border px-3 py-2 text-base font-medium shadow-lg ${colors} ${className}`}
		>
			«&nbsp;{text}&nbsp;»
		</p>
	)
}

export function BattleIntro({
	player,
	opponent,
	onReady,
}: {
	player: IntroTrainer
	opponent: IntroTrainer
	/** Called once, when the opening reaches the loop it can be held on. */
	onReady?: () => void
}) {
	const [step, setStep] = useState(0)
	const [tick, setTick] = useState(0)
	const [released, setReleased] = useState(false)
	// Drawn once per battle so a re-render does not change what was said.
	const [lines] = useState(() => ({ player: pick(PLAYER_LINES), opponent: pick(OPPONENT_LINES) }))
	const told = useRef(false)
	const wide = useWideStage()

	const phase: Phase = step < BEATS.length ? BEATS[step].name : 'standoff'

	// One beat at a time; the last one falls through to the standoff.
	useEffect(() => {
		if (step >= BEATS.length) return
		const timer = setTimeout(() => setStep((at) => at + 1), BEATS[step].ms)
		return () => clearTimeout(timer)
	}, [step])

	// The ball opens partway through its own beat, not at the end of it.
	useEffect(() => {
		if (phase !== 'throw') return
		const timer = setTimeout(() => setReleased(true), RELEASE_MS)
		return () => clearTimeout(timer)
	}, [phase])

	// Legs only move while the trainers are actually walking on.
	useEffect(() => {
		if (phase !== 'enter') return
		const timer = setInterval(() => setTick((at) => at + 1), STRIDE_MS)
		return () => clearInterval(timer)
	}, [phase])

	// Once, and only once: the caller may cut to the resolved fight from here.
	useEffect(() => {
		if (phase !== 'standoff' || told.current) return
		told.current = true
		onReady?.()
	}, [phase, onReady])

	/** Skipping jumps to the loop — there is nothing after it to skip to. */
	const skip = () => {
		setStep(BEATS.length)
		setReleased(true)
	}

	// 0 is the standing pose; 1 and 2 alternate the legs.
	const frame = phase === 'enter' ? 1 + (tick % 2) : 0

	let caption = 'Le combat s’écrit…'
	if (phase === 'enter') caption = 'Les deux dresseurs entrent sur le terrain…'
	else if (phase === 'opponent') caption = `${opponent.name} te défie !`
	else if (phase === 'player') caption = `${player.name} relève le défi !`
	else if (phase === 'throw') caption = 'Les Pokémon entrent en scène !'

	return (
		<div>
			<div className="flex items-center justify-between gap-2 px-1 pb-2 text-base">
				<span className="truncate font-semibold text-amber-300">{opponent.name}</span>
				<span className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-500">vs</span>
				<span className="truncate text-right font-semibold text-emerald-300">{player.name}</span>
			</div>

			{/* `--intro-reach` is how far forward a side's Pokemon stands, and how
			    far its ball flies to get there — one number, so the two can never
			    drift apart. Each `hand` rail sits at its Pokemon's centre height
			    for the same reason. */}
			<div className="relative h-52 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-emerald-950/40 to-black/40 [--intro-reach:72px] sm:h-64 sm:[--intro-reach:122px]">
				<IntroSide
					trainer={opponent}
					phase={phase}
					frame={frame}
					released={released}
					flip
					wide={wide}
					rails={{ trainer: 'top-[18px]', hand: 'top-[64px] sm:top-[80px]', pokemon: 'top-[32px]' }}
				/>
				<IntroSide
					trainer={player}
					phase={phase}
					frame={frame}
					released={released}
					flip={false}
					wide={wide}
					rails={{
						trainer: 'bottom-[26px]',
						hand: 'bottom-[36px] sm:bottom-[52px]',
						pokemon: 'bottom-[4px]',
					}}
				/>

				{/* Speech, above both halves so the mirror never reaches the text. */}
				{phase === 'opponent' && (
					<Bubble text={lines.opponent} tone="opponent" className="right-[84px] top-[14px] text-right sm:right-[108px]" />
				)}
				{phase === 'player' && (
					<Bubble text={lines.player} tone="player" className="bottom-[22px] left-[84px] sm:left-[108px]" />
				)}
			</div>

			<p
				aria-live="polite"
				className="mt-3 min-h-[2.75rem] rounded-md border border-white/10 bg-black/45 px-3 py-2 text-base leading-snug text-slate-100"
			>
				{caption}
			</p>

			{phase === 'standoff' ? (
				/* No progress to report, only that something is still happening. */
				<div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
					<div className="h-full w-1/3 animate-[introWait_1.4s_ease-in-out_infinite] rounded-full bg-amber-300/80" />
				</div>
			) : (
				<button
					type="button"
					onClick={skip}
					className="mt-3 w-full text-center text-sm text-slate-400 underline-offset-2 hover:text-white hover:underline"
				>
					Passer la présentation
				</button>
			)}

			<style>{`@keyframes introWait {
				0% { transform: translateX(-100%); }
				100% { transform: translateX(300%); }
			}`}</style>
		</div>
	)
}
