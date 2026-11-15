import { useEffect, useState } from 'react'

import { spriteUrlFor } from '../map'
import { LevelBadge } from '../progression'
import type { BattleFighter, Side } from './api'
import type { FloatingHit, PlaybackView } from './useBattlePlayback'

/**
 * The arena: two fighters, their health, and everything that happens between
 * them. It renders the replay's view, never the raw server state — which is
 * what lets a knockout land before the next Pokemon walks on.
 */

/** Glow colour per move type, for the impact burst. */
const TYPE_GLOW: Record<string, string> = {
	normal: '#d9d4c0',
	fire: '#ff7a1a',
	water: '#3fa9f5',
	electric: '#ffd93b',
	grass: '#4fc24f',
	ice: '#9fe8f5',
	fighting: '#d1452b',
	poison: '#b25ad1',
	ground: '#d9b45b',
	flying: '#a9c6f5',
	psychic: '#ff5fa2',
	bug: '#9bbf2f',
	rock: '#bba55d',
	ghost: '#7b62a3',
	dragon: '#7a5bef',
	dark: '#6b5a4e',
	steel: '#b8b8c8',
	fairy: '#f2a5e0',
	// "Lutte" : sans type, donc sans couleur de type.
	untyped: '#8d8d8d',
}

/** One character every this many milliseconds. */
const TYPING_MS = 18

function glow(type: string): string {
	return TYPE_GLOW[type] ?? TYPE_GLOW.normal
}

function barColor(ratio: number): string {
	if (ratio > 0.5) return 'bg-emerald-500'
	if (ratio > 0.2) return 'bg-amber-400'
	return 'bg-red-500'
}

function HealthBar({ fighter, align }: { fighter: BattleFighter; align: 'left' | 'right' }) {
	const ratio = fighter.hp / fighter.maxHp
	return (
		<div className={`w-48 ${align === 'right' ? 'text-right' : ''}`}>
			<div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
				<span className="truncate text-base font-medium capitalize">{fighter.name}</span>
				<LevelBadge level={fighter.level} />
			</div>
			<p className={`text-xs tabular-nums text-slate-400 ${align === 'right' ? 'text-right' : ''}`}>
				{fighter.hp}/{fighter.maxHp} PV
			</p>
			<div className="mt-1 h-3 overflow-hidden rounded-full bg-black/50">
				<div
					className={`h-full rounded-full transition-[width] duration-500 ease-out ${barColor(ratio)}`}
					style={{ width: `${Math.max(0, ratio) * 100}%` }}
				/>
			</div>
		</div>
	)
}

function TeamPips({ team, align }: { team: BattleFighter[]; align: 'left' | 'right' }) {
	return (
		<ul className={`flex gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
			{team.map((fighter, index) => (
				<li key={`${fighter.pokedexId}-${index}`}>
					<img
						src={spriteUrlFor(fighter.pokedexId)}
						alt=""
						title={fighter.name}
						className={`h-7 w-7 [image-rendering:pixelated] ${fighter.hp === 0 ? 'opacity-25 grayscale' : ''}`}
					/>
				</li>
			))}
		</ul>
	)
}

/** The burst drawn on whoever just took the hit. */
function Impact({ type }: { type: string }) {
	const color = glow(type)
	return (
		<span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
			<span
				className="absolute left-0 top-0 block h-24 w-24 animate-impact rounded-full"
				style={{ background: `radial-gradient(circle, ${color} 0%, ${color}66 40%, transparent 70%)` }}
			/>
			<span
				className="absolute left-0 top-0 block h-20 w-20 animate-spark"
				style={{
					background: `conic-gradient(from 0deg, transparent 0deg, ${color} 20deg, transparent 40deg, transparent 180deg, ${color} 200deg, transparent 220deg)`,
					clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
				}}
			/>
		</span>
	)
}

function DamageNumber({ hit }: { hit: FloatingHit }) {
	return (
		<span
			aria-hidden
			className={`pointer-events-none absolute left-1/2 top-2 animate-float-up whitespace-nowrap font-bold drop-shadow-[0_2px_0_rgba(0,0,0,0.6)] ${
				hit.critical ? 'text-3xl text-amber-300' : 'text-2xl text-white'
			}`}
		>
			-{hit.damage}
			{hit.critical && <span className="ml-1 text-sm align-top">CRIT</span>}
		</span>
	)
}

/**
 * The battle's text box, typed out rather than printed.
 *
 * The typing is not decoration: a line is handed over at the exact moment its
 * attack starts and is given the length of that attack to appear, so the
 * commentary and the sprites stay on the same beat. `textKey` changes with
 * every line, which restarts the effect even when the same sentence repeats.
 */
function Caption({ text, textKey }: { text: string; textKey: number }) {
	const [shown, setShown] = useState('')

	useEffect(() => {
		setShown('')
		if (!text) return

		let at = 0
		const timer = setInterval(() => {
			at += 1
			setShown(text.slice(0, at))
			if (at >= text.length) clearInterval(timer)
		}, TYPING_MS)

		return () => clearInterval(timer)
	}, [text, textKey])

	return (
		<p
			aria-live="polite"
			className="mt-3 min-h-[2.75rem] rounded-md border border-white/10 bg-black/45 px-3 py-2 text-base leading-snug text-slate-100"
		>
			{shown}
			{shown.length < text.length && <span className="ml-0.5 animate-pulse text-emerald-300">|</span>}
		</p>
	)
}

function Fighter({
	fighter,
	side,
	view,
	hits,
}: {
	fighter: BattleFighter
	side: 'player' | 'master'
	view: PlaybackView
	hits: FloatingHit[]
}) {
	// The player's sprite is mirrored, so it uses the `*-right` keyframes,
	// which carry the flip themselves.
	const mirrored = side === 'player'
	const suffix = mirrored ? 'right' : 'left'

	let motion: string
	if (view.fainting === side) motion = `animate-faint-${suffix}`
	else if (view.entering === side) motion = `animate-enter-${suffix}`
	else if (view.attacking === side) motion = `animate-dash-${suffix}`
	else if (view.impactOn === side) motion = `animate-recoil-${suffix}`
	else if (view.playing) motion = mirrored ? '-scale-x-100' : ''
	else motion = mirrored ? 'animate-ready-right' : 'animate-ready-left'

	const impact = hits.find((hit) => hit.side === side)

	return (
		<span className="relative inline-block">
			<img
				// Remounting on each motion restarts the one-shot keyframes; without
				// it a second hit in the same round would not replay.
				key={`${fighter.pokedexId}-${motion}-${view.attacking}-${view.impactOn}`}
				src={spriteUrlFor(fighter.pokedexId)}
				alt={fighter.name}
				className={`h-28 w-28 [image-rendering:pixelated] ${motion} ${fighter.hp === 0 ? 'opacity-30' : ''}`}
			/>
			{view.impactOn === side && impact && <Impact type={impact.type} />}
			{hits
				.filter((hit) => hit.side === side)
				.map((hit) => (
					<DamageNumber key={hit.id} hit={hit} />
				))}
		</span>
	)
}

export function BattleField({
	player,
	master,
	view,
}: {
	player: Side
	master: Side
	view: PlaybackView
}) {
	const playerActive = player.team[player.active]
	const masterActive = master.team[master.active]

	return (
		<div
			className={`rounded-lg border border-white/10 bg-gradient-to-b from-emerald-950/40 to-black/40 p-4 ${
				view.shake ? 'animate-arena-shake' : ''
			}`}
		>
			<div className="flex items-start justify-between">
				{masterActive && <HealthBar fighter={masterActive} align="left" />}
				<TeamPips team={master.team} align="right" />
			</div>

			<div className="flex justify-end">
				{masterActive && <Fighter fighter={masterActive} side="master" view={view} hits={view.hits} />}
			</div>

			<div className="flex items-end justify-between">
				{playerActive && <Fighter fighter={playerActive} side="player" view={view} hits={view.hits} />}
				<div className="flex flex-col items-end gap-1">
					<TeamPips team={player.team} align="right" />
					{playerActive && <HealthBar fighter={playerActive} align="right" />}
				</div>
			</div>

			<Caption text={view.caption} textKey={view.captionKey} />
		</div>
	)
}
