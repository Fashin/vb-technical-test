import { GiCrossedSwords, GiTrade } from 'react-icons/gi'

import type { EncounterKind, Invitation, WorldPlayerState } from '../realtime'

/**
 * The two prompts an encounter needs, both sitting above the HUD.
 *
 * Standing next to someone offers; being offered something asks. Neither is a
 * modal: the player can walk away mid-prompt, and walking away is exactly how
 * you refuse — the server drops the invitation when the distance grows.
 */

export function NeighbourPrompt({
	neighbour,
	busy,
	onInvite,
}: {
	neighbour: WorldPlayerState
	/** Set while an invitation of ours is waiting for an answer. */
	busy: EncounterKind | null
	onInvite: (kind: EncounterKind) => void
}) {
	return (
		<div className="pointer-events-auto absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/15 bg-black/80 px-3 py-2 shadow-lg">
			<span className="text-base text-slate-200">
				{busy ? `En attente de ${neighbour.name}…` : neighbour.name}
			</span>

			<button
				type="button"
				disabled={busy !== null}
				onClick={() => onInvite('duel')}
				className="flex items-center gap-1 rounded bg-amber-400 px-3 py-1 text-sm font-medium text-amber-950 hover:bg-amber-300 disabled:opacity-40"
			>
				<GiCrossedSwords className="h-4 w-4" />
				Défier
			</button>

			<button
				type="button"
				disabled={busy !== null}
				onClick={() => onInvite('trade')}
				className="flex items-center gap-1 rounded bg-sky-500 px-3 py-1 text-sm font-medium text-sky-950 hover:bg-sky-400 disabled:opacity-40"
			>
				<GiTrade className="h-4 w-4" />
				Échanger
			</button>
		</div>
	)
}

export function InvitationPrompt({
	invitation,
	onRespond,
}: {
	invitation: Invitation
	onRespond: (accept: boolean) => void
}) {
	const duel = invitation.kind === 'duel'

	return (
		<div className="pointer-events-auto absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/15 bg-black/85 px-3 py-2 shadow-lg">
			<span className="flex items-center gap-2 text-base text-slate-100">
				{duel ? (
					<GiCrossedSwords className="h-5 w-5 text-amber-300" />
				) : (
					<GiTrade className="h-5 w-5 text-sky-300" />
				)}
				<span>
					<span className="font-medium">{invitation.fromName}</span>{' '}
					{duel ? 'te défie en duel' : 'te propose un échange'}
				</span>
			</span>

			<button
				type="button"
				onClick={() => onRespond(true)}
				className="rounded bg-emerald-500 px-3 py-1 text-sm font-medium text-emerald-950 hover:bg-emerald-400"
			>
				Accepter
			</button>
			<button
				type="button"
				onClick={() => onRespond(false)}
				className="rounded border border-white/15 px-3 py-1 text-sm font-medium text-slate-300 hover:bg-white/10"
			>
				Refuser
			</button>
		</div>
	)
}
