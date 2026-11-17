import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GiPokecog } from 'react-icons/gi'
import { FiSearch } from 'react-icons/fi'

import { useCollection, useFavourites } from '../collection'
import { ALL_TYPES } from '../pokemon'
import { Breadcrumb, useEscapeToClose } from '../ui'
import * as api from './api'
import type { Team, TeamMember, TeamsState } from './api'
import { RosterCard } from './RosterCard'
import { TeamSlot } from './TeamSlot'
import { TypeSelect } from './TypeSelect'

/**
 * Team builder.
 *
 * Teams are built out of the cards the player actually owns — the collection
 * is the roster, so a team is something the boosters earned rather than a free
 * pick from all 898. A card can sit in several teams at once: teams are
 * loadouts, not exclusive ownership.
 *
 * The order inside a team is the battle order, and it is edited here: the
 * server already stores a slot per member and `setMembers` takes the array in
 * slot order, so reordering is the same call as adding and removing, with the
 * ids in a different sequence.
 *
 * Same frame as the collection — nearly the whole screen, filters and lists
 * side by side — because it is the same job seen from the other end: there you
 * look at what you own, here you pick from it.
 */
export function TeamPanel({ onClose }: { onClose: () => void }) {
	const [state, setState] = useState<TeamsState | null>(null)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [renaming, setRenaming] = useState(false)
	const [draftName, setDraftName] = useState('')
	const [confirmDelete, setConfirmDelete] = useState(false)
	const backdrop = useRef<HTMLDivElement>(null)

	/** Roster filters: by name, and by type through the select. */
	const [search, setSearch] = useState('')
	const [typeFilter, setTypeFilter] = useState('')

	/** Which slot is being dragged, and which one it is hovering over. */
	const [dragIndex, setDragIndex] = useState<number | null>(null)
	const [overIndex, setOverIndex] = useState<number | null>(null)

	const collection = useCollection()
	const favourites = useFavourites()

	useEffect(() => backdrop.current?.focus(), [])
	useEscapeToClose(onClose)

	const load = useCallback(async () => {
		try {
			const next = await api.fetchTeams()
			setState(next)
			setSelectedId((current) => current ?? next.activeTeamId ?? next.teams[0]?.id ?? null)
			setError(null)
		} catch (cause) {
			setError(cause instanceof api.TeamError ? cause.message : 'Serveur injoignable')
			setState({ teams: [], activeTeamId: null, maxTeams: 6, teamSize: 6 })
		}
	}, [])

	useEffect(() => {
		void load()
	}, [load])

	const selected: Team | null = useMemo(
		() => state?.teams.find((team) => team.id === selectedId) ?? null,
		[state, selectedId],
	)

	/** Every mutation goes through here: one busy flag, one error surface. */
	const run = async (action: () => Promise<unknown>) => {
		setBusy(true)
		setError(null)
		try {
			await action()
			await load()
		} catch (cause) {
			setError(cause instanceof api.TeamError ? cause.message : 'Serveur injoignable')
			// The optimistic order below may now be a lie; the reload puts the
			// server's own answer back on screen.
			await load().catch(() => undefined)
		} finally {
			setBusy(false)
		}
	}

	const addCard = (cardId: string) => {
		if (!selected || !state) return
		if (selected.members.length >= state.teamSize) return
		if (selected.members.some((member) => member.cardId === cardId)) return

		const cardIds = [...selected.members.map((member) => member.cardId), cardId]
		void run(() => api.setMembers(selected.id, cardIds))
	}

	const removeCard = (cardId: string) => {
		if (!selected) return
		const cardIds = selected.members.map((member) => member.cardId).filter((id) => id !== cardId)
		void run(() => api.setMembers(selected.id, cardIds))
	}

	/**
	 * Move a member to another position.
	 *
	 * Applied on screen before the request leaves: dragging a card and watching
	 * it snap back for the length of a round trip reads as a failure, and the
	 * reload in `run` corrects the order if the server disagrees.
	 */
	const move = (from: number, to: number) => {
		if (!selected) return
		const members = selected.members
		if (from === to || from < 0 || to < 0 || from >= members.length || to >= members.length) return

		const reordered = [...members]
		const [moved] = reordered.splice(from, 1)
		reordered.splice(to, 0, moved)

		const ordered: TeamMember[] = reordered.map((member, slot) => ({ ...member, slot }))
		setState((previous) =>
			previous
				? {
						...previous,
						teams: previous.teams.map((team) =>
							team.id === selected.id ? { ...team, members: ordered } : team,
						),
					}
				: previous,
		)

		void run(() => api.setMembers(selected.id, ordered.map((member) => member.cardId)))
	}

	const slots: (TeamMember | null)[] = useMemo(() => {
		const size = state?.teamSize ?? 6
		const filled = selected?.members ?? []
		return Array.from({ length: size }, (_, index) => filled[index] ?? null)
	}, [selected, state])

	const inTeam = useMemo(
		() => new Set(selected?.members.map((member) => member.cardId) ?? []),
		[selected],
	)

	/** Only the types the player actually owns: a dead option helps nobody. */
	const rosterTypes = useMemo(() => {
		const present = new Set<string>()
		for (const card of collection.cards) for (const type of card.types) present.add(type)
		return ALL_TYPES.filter((type) => present.has(type))
	}, [collection.cards])

	/**
	 * The roster, filtered and ordered. Favourites float to the top — that is
	 * what starring a card is for — and the strongest copy of a Pokémon comes
	 * before its weaker twins.
	 */
	const isFavourite = favourites.has
	const roster = useMemo(() => {
		const needle = search.trim().toLowerCase()
		const visible = collection.cards.filter((card) => {
			if (typeFilter && !card.types.includes(typeFilter)) return false
			if (needle && !card.name.toLowerCase().includes(needle)) return false
			return true
		})

		return visible.sort(
			(a, b) =>
				Number(isFavourite(b.id)) - Number(isFavourite(a.id)) ||
				b.level - a.level ||
				a.name.localeCompare(b.name),
		)
	}, [collection.cards, search, typeFilter, isFavourite])

	const full = state ? (selected?.members.length ?? 0) >= state.teamSize : false
	const canCreate = state ? state.teams.length < state.maxTeams : false

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/60 p-2 outline-none sm:p-4"
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label="Mon équipe"
				className="my-auto flex h-full max-h-[96dvh] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141c17] text-slate-100 shadow-2xl"
			>
				<header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-white/10 px-4 py-3">
					<div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
						<Breadcrumb
							trail={[
								{ label: 'Carte', onClick: onClose },
								{ label: 'Mon équipe' },
							]}
							icon={GiPokecog}
							tone="text-emerald-300"
						/>
						{state && (
							<p className="text-sm text-slate-400">
								{state.teams.length}/{state.maxTeams} équipe{state.teams.length > 1 ? 's' : ''}
							</p>
						)}
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
					<p role="alert" className="shrink-0 bg-red-500/15 px-4 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
					{/* Left: the teams themselves. */}
					<aside className="flex max-h-[30dvh] shrink-0 flex-col border-b border-white/10 p-4 lg:max-h-none lg:w-56 lg:border-b-0 lg:border-r">
						<p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Équipes</p>

						<ul className="mt-2 flex-1 space-y-1 overflow-y-auto">
							{state?.teams.map((team) => (
								<li key={team.id}>
									<button
										type="button"
										onClick={() => {
											setSelectedId(team.id)
											setRenaming(false)
											setConfirmDelete(false)
										}}
										aria-pressed={team.id === selectedId}
										className={`w-full rounded-md px-2 py-1.5 text-left text-base transition ${
											team.id === selectedId
												? 'bg-white/15 text-white'
												: 'text-slate-300 hover:bg-white/10'
										}`}
									>
										<span className="block truncate">{team.name}</span>
										<span className="text-xs text-slate-500">
											{team.members.length}/{state.teamSize}
											{team.id === state.activeTeamId && ' · en lice'}
										</span>
									</button>
								</li>
							))}
							{state?.teams.length === 0 && (
								<li className="px-1 py-2 text-sm text-slate-500">Aucune équipe pour l’instant.</li>
							)}
						</ul>

						<button
							type="button"
							disabled={busy || !canCreate}
							onClick={() =>
								void run(async () => {
									const { team } = await api.createTeam(`Équipe ${(state?.teams.length ?? 0) + 1}`)
									setSelectedId(team.id)
								})
							}
							className="mt-2 shrink-0 rounded-md border border-white/15 px-3 py-2 text-base text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
						>
							+ Nouvelle équipe
						</button>
					</aside>

					{/* Right: the selected team, then the roster it is picked from. */}
					<main className="flex min-h-0 min-w-0 flex-1 flex-col">
						{!selected ? (
							<p className="flex flex-1 items-center justify-center text-base text-slate-500">
								Crée une équipe pour commencer.
							</p>
						) : (
							<>
								<div className="min-h-0 overflow-y-auto border-b border-white/10 px-4 py-3">
									<div className="flex flex-wrap items-center gap-2">
										{renaming ? (
											<form
												className="flex flex-1 gap-2"
												onSubmit={(event) => {
													event.preventDefault()
													const name = draftName.trim()
													if (!name) return
													void run(() => api.renameTeam(selected.id, name)).then(() =>
														setRenaming(false),
													)
												}}
											>
												<input
													autoFocus
													value={draftName}
													onChange={(event) => setDraftName(event.target.value)}
													maxLength={24}
													aria-label="Nom de l’équipe"
													className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-base outline-none focus:border-emerald-400"
												/>
												<button
													type="submit"
													disabled={busy}
													className="rounded-md bg-emerald-500 px-3 py-1 text-base font-medium text-emerald-950 disabled:opacity-40"
												>
													OK
												</button>
												<button
													type="button"
													onClick={() => setRenaming(false)}
													className="rounded-md px-2 py-1 text-base text-slate-400 hover:bg-white/10"
												>
													Annuler
												</button>
											</form>
										) : (
											<>
												<h3 className="min-w-0 flex-1 truncate text-lg font-semibold">
													{selected.name}
												</h3>
												<button
													type="button"
													onClick={() => {
														setDraftName(selected.name)
														setRenaming(true)
													}}
													className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
												>
													Renommer
												</button>
												{selected.id !== state?.activeTeamId && (
													<button
														type="button"
														disabled={busy}
														onClick={() => void run(() => api.setActiveTeam(selected.id))}
														className="rounded px-2 py-1 text-sm text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-40"
													>
														Envoyer en lice
													</button>
												)}
												<button
													type="button"
													onClick={() => setConfirmDelete(true)}
													className="rounded px-2 py-1 text-sm text-red-300/80 hover:bg-red-500/15 hover:text-red-200"
												>
													Supprimer
												</button>
											</>
										)}
									</div>

									{confirmDelete && (
										<div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-red-500/10 px-3 py-2">
											<span className="flex-1 text-sm text-red-200">
												Supprimer « {selected.name} » ? Les cartes restent dans ta collection.
											</span>
											<button
												type="button"
												onClick={() => setConfirmDelete(false)}
												className="rounded-md border border-white/15 px-3 py-1 text-sm text-slate-300 hover:bg-white/10"
											>
												Annuler
											</button>
											<button
												type="button"
												disabled={busy}
												onClick={() =>
													void run(() => api.deleteTeam(selected.id)).then(() => {
														setSelectedId(null)
														setConfirmDelete(false)
													})
												}
												className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40"
											>
												Supprimer
											</button>
										</div>
									)}

									<p className="mt-1 text-sm text-slate-500">
										{selected.members.length}/{state?.teamSize} Pokémon · glisse les cartes ou
										utilise les flèches pour choisir qui commence
										{selected.id === state?.activeTeamId && ' · c’est cette équipe qui combat'}
									</p>

									<ul className="mt-3 flex flex-wrap gap-2">
										{slots.map((member, index) => (
											<TeamSlot
												key={member?.cardId ?? `empty-${index}`}
												member={member}
												index={index}
												total={selected.members.length}
												busy={busy}
												dragging={dragIndex === index}
												dropTarget={overIndex === index && dragIndex !== null && dragIndex !== index}
												onRemove={() => member && removeCard(member.cardId)}
												onMove={(to) => move(index, to)}
												onDragStart={() => setDragIndex(index)}
												onDragEnter={() => setOverIndex(index)}
												onDrop={() => {
													if (dragIndex !== null) move(dragIndex, index)
													setDragIndex(null)
													setOverIndex(null)
												}}
												onDragEnd={() => {
													setDragIndex(null)
													setOverIndex(null)
												}}
											/>
										))}
									</ul>
								</div>

								{/* The roster, with its own search and type filter. */}
								<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
									<p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
										Ma collection
									</p>
									<div className="relative min-w-0 flex-1 sm:max-w-xs">
										<FiSearch
											aria-hidden
											className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
										/>
										<input
											type="search"
											value={search}
											onChange={(event) => setSearch(event.target.value)}
											placeholder="Rechercher un Pokémon…"
											aria-label="Rechercher un Pokémon par son nom"
											className="w-full rounded-md border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
										/>
									</div>
									<TypeSelect value={typeFilter} types={rosterTypes} onChange={setTypeFilter} />
									<span className="text-sm text-slate-500">
										{roster.length} carte{roster.length > 1 ? 's' : ''}
										{full && ' · équipe complète'}
									</span>
								</div>

								<div className="min-h-0 flex-1 overflow-y-auto p-4">
									{collection.loading ? (
										<p className="py-6 text-center text-base text-slate-500">Chargement…</p>
									) : collection.cards.length === 0 ? (
										<p className="py-6 text-center text-base text-slate-500">
											Aucune carte — ouvre un booster pour commencer.
										</p>
									) : roster.length === 0 ? (
										<p className="py-6 text-center text-base text-slate-500">
											Aucune carte ne correspond à cette recherche.
										</p>
									) : (
										<ul className="flex flex-wrap gap-1.5">
											{roster.map((card) => (
												<RosterCard
													key={card.id}
													card={card}
													picked={inTeam.has(card.id)}
													disabled={busy || full}
													favourite={favourites.has(card.id)}
													onAdd={() => addCard(card.id)}
													onToggleFavourite={() => favourites.toggle(card.id)}
												/>
											))}
										</ul>
									)}
								</div>
							</>
						)}
					</main>
				</div>
			</section>
		</div>
	)
}
