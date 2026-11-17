import { useEffect, useState } from 'react'
import { GiBackwardTime, GiCardRandom } from 'react-icons/gi'

import { spriteUrlFor } from '../map'
import { typeStyle } from '../pokemon'
import { Breadcrumb, useEscapeToClose } from '../ui'
import * as api from './api'
import type { PokemonDetail as Detail } from './api'

/**
 * One Pokémon, in full.
 *
 * Opened from a card in the collection. The listing already carries the four
 * headline stats, so this screen exists for what it cannot hold: the complete
 * stat line, the type matchups, and where the Pokémon sits in its family.
 *
 * It is the only consumer of `GET /pokemons/:id` — the route the brief asks
 * for, which until now no screen called.
 */

/** The six stats, in the games' order, with their French names. */
const STATS: { key: keyof Detail['stats']; label: string }[] = [
	{ key: 'HP', label: 'PV' },
	{ key: 'attack', label: 'Attaque' },
	{ key: 'defense', label: 'Défense' },
	{ key: 'special_attack', label: 'Atq. Spé' },
	{ key: 'special_defense', label: 'Déf. Spé' },
	{ key: 'speed', label: 'Vitesse' },
]

/** A base stat tops out around 160 in this Pokédex; the bar is read against that. */
const STAT_CEILING = 160

/**
 * The best total in this Pokédex — Mewtwo's 680. The BST bar is read against
 * it, so a full bar means "nothing in Kanto adds up to more" rather than a
 * share of some round number nobody reaches.
 */
const BST_CEILING = 680

function StatRow({ label, value }: { label: string; value: number }) {
	const ratio = Math.min(1, value / STAT_CEILING)
	return (
		<li className="flex items-center gap-3">
			<span className="w-20 shrink-0 text-sm text-slate-400">{label}</span>
			<span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-slate-200">{value}</span>
			<span className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
				<span className="block h-full rounded-full bg-emerald-400" style={{ width: `${ratio * 100}%` }} />
			</span>
		</li>
	)
}

/**
 * The six base stats added up.
 *
 * The number players compare Pokémon by: the individual bars say what a
 * Pokémon is good at, the total says how much it has been given overall. It is
 * drawn under the six it sums, separated by a rule, so it reads as their total
 * and not as a seventh stat.
 */
function TotalRow({ value }: { value: number }) {
	const ratio = Math.min(1, value / BST_CEILING)
	return (
		<li className="mt-2 flex items-center gap-3 border-t border-white/10 pt-2">
			<span className="w-20 shrink-0 text-sm font-semibold text-slate-300" title="Base Stat Total">
				Total (BST)
			</span>
			<span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-100">{value}</span>
			<span className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
				<span className="block h-full rounded-full bg-amber-300" style={{ width: `${ratio * 100}%` }} />
			</span>
		</li>
	)
}

/** Only the matchups that actually matter: neutral ones say nothing. */
function Matchups({ resistances }: { resistances: api.Resistance[] }) {
	const notable = resistances.filter((entry) => entry.damage_multiplier !== 1)
	if (notable.length === 0) return null

	const weak = notable.filter((entry) => entry.damage_multiplier > 1)
	const strong = notable.filter((entry) => entry.damage_multiplier < 1)

	const group = (title: string, entries: api.Resistance[]) =>
		entries.length > 0 && (
			<div>
				<h4 className="text-sm uppercase tracking-wide text-slate-500">{title}</h4>
				<ul className="mt-1.5 flex flex-wrap gap-1">
					{entries.map((entry) => {
						const style = typeStyle(entry.name)
						return (
							<li
								key={entry.name}
								className={`rounded px-2 py-0.5 text-sm font-medium ${style.chip}`}
								title={`×${entry.damage_multiplier}`}
							>
								{style.label}
								<span className="ml-1 opacity-70">×{entry.damage_multiplier}</span>
							</li>
						)
					})}
				</ul>
			</div>
		)

	return (
		<div className="mt-4 space-y-3">
			{group('Vulnérable à', weak)}
			{group('Résiste à', strong)}
		</div>
	)
}

export function PokemonDetail({
	pokedexId,
	from = 'Ma collection',
	onClose,
}: {
	pokedexId: number
	/** The collection this sheet was opened from, named in the trail. */
	from?: string
	onClose: () => void
}) {
	const [pokemon, setPokemon] = useState<Detail | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEscapeToClose(onClose)

	useEffect(() => {
		let cancelled = false
		setPokemon(null)
		setError(null)

		api
			.fetchPokemon(pokedexId)
			.then((found) => !cancelled && setPokemon(found))
			.catch((cause) => {
				if (cancelled) return
				setError(cause instanceof api.PokedexError ? cause.message : 'Serveur injoignable')
			})

		return () => {
			cancelled = true
		}
	}, [pokedexId])

	return (
		<div
			className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label={pokemon ? `Fiche de ${pokemon.name}` : 'Fiche Pokémon'}
				className="my-auto flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex shrink-0 items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<img
							src={spriteUrlFor(pokedexId)}
							alt=""
							className="h-16 w-16 [image-rendering:pixelated]"
						/>
						<div className="min-w-0">
							{/* Closing this sheet lands back on the collection, so that is
							    the level the trail offers — not the map behind it. */}
							<Breadcrumb
								trail={[
									{ label: from, onClick: onClose },
									{ label: pokemon?.name ?? '…' },
								]}
								icon={GiCardRandom}
								tone="text-emerald-300"
							/>
							<p className="text-base text-slate-400">
								N° {String(pokedexId).padStart(3, '0')}
								{pokemon && ` · génération ${pokemon.apiGeneration}`}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				{error && (
					<p role="alert" className="mt-3 shrink-0 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				{!pokemon && !error ? (
					<p className="py-10 text-center text-base text-slate-500">Chargement…</p>
				) : (
					pokemon && (
						<div className="mt-4 min-h-0 flex-1 overflow-y-auto">
							<ul className="flex flex-wrap gap-1">
								{pokemon.apiTypes.map((type) => {
									const style = typeStyle(type.name)
									return (
										<li
											key={type.name}
											className={`rounded px-2 py-0.5 text-sm font-medium ${style.chip}`}
										>
											{style.label}
										</li>
									)
								})}
							</ul>

							<ul className="mt-4 space-y-1.5">
								{STATS.map(({ key, label }) => (
									<StatRow key={key} label={label} value={pokemon.stats[key]} />
								))}
								<TotalRow value={STATS.reduce((sum, { key }) => sum + pokemon.stats[key], 0)} />
							</ul>

							<Matchups resistances={pokemon.apiResistances} />

							{(pokemon.apiPreEvolution !== 'none' || pokemon.apiEvolutions.length > 0) && (
								<div className="mt-4">
									<h4 className="text-sm uppercase tracking-wide text-slate-500">Évolutions</h4>
									<div className="mt-1.5 flex flex-wrap items-center gap-2 text-base">
										{pokemon.apiPreEvolution !== 'none' && (
											<span className="flex items-center gap-1 text-slate-400">
												<GiBackwardTime className="h-5 w-5" />
												<span className="capitalize">{pokemon.apiPreEvolution}</span>
											</span>
										)}
										<span className="font-medium capitalize text-slate-100">{pokemon.name}</span>
										{pokemon.apiEvolutions.map((evolution) => (
											<span key={evolution.pokedexId} className="flex items-center gap-1 text-slate-400">
												→
												<img
													src={spriteUrlFor(evolution.pokedexId)}
													alt=""
													className="h-8 w-8 [image-rendering:pixelated]"
												/>
												<span className="capitalize">{evolution.name}</span>
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					)
				)}
			</section>
		</div>
	)
}
