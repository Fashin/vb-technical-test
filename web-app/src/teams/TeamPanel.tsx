import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GiPokecog } from 'react-icons/gi'

import { RARITY } from '../boosters'
import { useCollection } from '../collection'
import { spriteUrlFor } from '../map'
import { HealthBar, LevelBadge, XpBar } from '../progression'
import { Breadcrumb, useEscapeToClose } from '../ui'
import * as api from './api'
import type { Team, TeamMember, TeamsState } from './api'

/** A filled slot: the Pokemon, with a click to bench it. */
function Slot({ member, onRemove }: { member: TeamMember | null; onRemove: () => void }) {
	if (!member) {
		return (
			<li className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-white/15 text-sm text-slate-600">
				vide
			</li>
		)
	}

	return (
		<li>
			<button
				type="button"
				onClick={onRemove}
				title={`Retirer ${member.name}`}
				className={`group flex h-24 w-24 flex-col items-center justify-center rounded-lg border-2 bg-black/40 transition hover:border-red-400/70 ${RARITY[member.rarity].ring}`}
			>
				<img
					src={spriteUrlFor(member.pokedexId)}
					alt=""
					className={`h-10 w-10 [image-rendering:pixelated] ${member.fainted ? 'opacity-40 grayscale' : ''}`}
				/>
				<span className="w-full truncate px-1 text-center text-xs capitalize text-slate-200">
					{member.name}
				</span>
				<LevelBadge level={member.level} className="mt-1" />
				<XpBar ratio={member.ratio} toNextLevel={member.toNextLevel} className="mt-1 w-14" />
				{member.health < 1 && <HealthBar health={member.health} className="mt-0.5 w-14" />}
				{member.inCare && <span className="text-[11px] font-medium text-red-300">en soins</span>}
			</button>
		</li>
	)
}

/**
 * Team builder.
 *
 * Teams are built out of the cards the player actually owns — the collection
 * is the roster, so a team is something the boosters earned rather than a free
 * pick from all 898. A card can sit in several teams at once: teams are
 * loadouts, not exclusive ownership.
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

	const collection = useCollection()

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

	const slots: (TeamMember | null)[] = useMemo(() => {
		const size = state?.teamSize ?? 6
		const filled = selected?.members ?? []
		return Array.from({ length: size }, (_, index) => filled[index] ?? null)
	}, [selected, state])

	const inTeam = useMemo(
		() => new Set(selected?.members.map((member) => member.cardId) ?? []),
		[selected],
	)

	const full = state ? (selected?.members.length ?? 0) >= state.teamSize : false
	const canCreate = state ? state.teams.length < state.maxTeams : false

	return (
		<div
			ref={backdrop}
			tabIndex={-1}
			className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 outline-none"
			onKeyDown={(event) => event.stopPropagation()}
			onKeyUp={(event) => event.stopPropagation()}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<section
				role="dialog"
				aria-label="Mon équipe"
				className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex items-center justify-between">
					<Breadcrumb
						trail={[
							{ label: 'Carte', onClick: onClose },
							{ label: 'Mon équipe' },
						]}
						icon={GiPokecog}
						tone="text-emerald-300"
					/>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						Fermer
					</button>
				</header>

				{error && (
					<p role="alert" className="mt-3 rounded-md bg-red-500/15 px-3 py-2 text-base text-red-300">
						{error}
					</p>
				)}

				<div className="mt-4 flex min-h-0 flex-1 gap-4">
					{/* Teams */}
					<aside className="flex w-44 shrink-0 flex-col">
						<p className="text-sm uppercase tracking-wide text-slate-500">
							Équipes {state && `(${state.teams.length}/${state.maxTeams})`}
						</p>

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
											team.id === selectedId ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'
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
							className="mt-2 rounded-md border border-white/15 px-3 py-2 text-base text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
						>
							+ Nouvelle équipe
						</button>
					</aside>

					{/* Selected team */}
					<div className="flex min-w-0 flex-1 flex-col">
						{!selected ? (
							<p className="flex flex-1 items-center justify-center text-base text-slate-500">
								Crée une équipe pour commencer.
							</p>
						) : (
							<>
								<div className="flex items-center gap-2">
									{renaming ? (
										<form
											className="flex flex-1 gap-2"
											onSubmit={(event) => {
												event.preventDefault()
												const name = draftName.trim()
												if (!name) return
												void run(() => api.renameTeam(selected.id, name)).then(() => setRenaming(false))
											}}
										>
											<input
												autoFocus
												value={draftName}
												onChange={(event) => setDraftName(event.target.value)}
												maxLength={24}
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
											<h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{selected.name}</h3>
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
										</>
									)}
								</div>

								<p className="mt-0.5 text-sm text-slate-500">
									{selected.members.length}/{state?.teamSize} Pokémon
									{selected.id === state?.activeTeamId && ' · c’est cette équipe qui combat dans l’arène'}
								</p>

								<ul className="mt-3 flex flex-wrap gap-2">
									{slots.map((member, index) => (
										<Slot
											key={member?.cardId ?? `empty-${index}`}
											member={member}
											onRemove={() => member && removeCard(member.cardId)}
										/>
									))}
								</ul>

								<p className="mt-4 text-sm uppercase tracking-wide text-slate-500">
									Ma collection {full && '· équipe complète'}
								</p>

								<div className="mt-2 min-h-0 flex-1 overflow-y-auto">
									{collection.loading ? (
										<p className="py-6 text-center text-base text-slate-500">Chargement…</p>
									) : collection.cards.length === 0 ? (
										<p className="py-6 text-center text-base text-slate-500">
											Aucune carte — ouvre un booster pour commencer.
										</p>
									) : (
										<ul className="flex flex-wrap gap-1.5">
											{collection.cards.map((card) => {
												const picked = inTeam.has(card.id)
												return (
													<li key={card.id}>
														<button
															type="button"
															disabled={busy || picked || full}
															onClick={() => addCard(card.id)}
															title={picked ? 'Déjà dans l’équipe' : `Ajouter ${card.name}`}
															className={`flex h-20 w-20 flex-col items-center justify-center rounded-md border bg-black/30 transition disabled:cursor-not-allowed ${
																picked
																	? 'border-emerald-400/60 opacity-40'
																	: 'border-white/10 hover:border-emerald-400/70 disabled:opacity-30'
															}`}
														>
															<img
																src={spriteUrlFor(card.pokedexId)}
																alt=""
																loading="lazy"
																className="h-10 w-10 [image-rendering:pixelated]"
															/>
															<span className="w-full truncate px-0.5 text-center text-[11px] capitalize text-slate-300">
																{card.name}
															</span>
														</button>
													</li>
												)
											})}
										</ul>
									)}
								</div>

								<div className="mt-3 border-t border-white/10 pt-3">
									{confirmDelete ? (
										<div className="flex items-center gap-2">
											<span className="flex-1 text-sm text-red-300">
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
									) : (
										<button
											type="button"
											onClick={() => setConfirmDelete(true)}
											className="text-sm text-red-300/80 hover:text-red-200 hover:underline"
										>
											Supprimer cette équipe
										</button>
									)}
								</div>
							</>
						)}
					</div>
				</div>
			</section>
		</div>
	)
}
