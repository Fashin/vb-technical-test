import { useEffect, useState } from 'react'
import { GiCheckMark, GiTrade } from 'react-icons/gi'

import { fetchCards, type Card } from '../boosters/api'
import { CardFace } from '../boosters/CardFace'
import { spriteUrlFor } from '../map'
import { LevelBadge } from '../progression'
import type { TradeCard, TradeSide, TradeState } from '../realtime'
import { Breadcrumb } from '../ui'

/**
 * A trade between two players.
 *
 * The table is the server's: this panel renders `trade:state` and sends
 * intents. The rule that makes it safe to use is enforced there too — any
 * change to either offer clears both confirmations — and it is spelled out on
 * screen, because a player who does not know that rule cannot trust the
 * screen.
 */

function Offer({ side, mine }: { side: TradeSide; mine: boolean }) {
	return (
		<div
			className={`flex min-h-[9rem] flex-1 flex-col rounded-lg border p-3 ${
				side.confirmed ? 'border-emerald-400/60 bg-emerald-950/20' : 'border-white/10 bg-black/25'
			}`}
		>
			<div className="flex items-center justify-between">
				<span className="truncate font-medium">
					{side.name}
					{mine && <span className="ml-2 text-sm text-emerald-300">toi</span>}
				</span>
				{side.confirmed && (
					<span className="flex items-center gap-1 text-sm text-emerald-300">
						<GiCheckMark className="h-4 w-4" /> prêt
					</span>
				)}
			</div>

			{side.offer.length === 0 ? (
				<p className="flex flex-1 items-center justify-center text-sm text-slate-500">Rien sur la table</p>
			) : (
				<ul className="mt-2 flex flex-wrap gap-2">
					{side.offer.map((card: TradeCard) => (
						<li
							key={card.cardId}
							className="flex w-20 flex-col items-center rounded-md border border-white/10 bg-black/30 p-1"
						>
							<img
								src={spriteUrlFor(card.pokedexId)}
								alt=""
								className={`h-12 w-12 [image-rendering:pixelated] ${card.health <= 0 ? 'opacity-40 grayscale' : ''}`}
							/>
							<span className="w-full truncate text-center text-sm capitalize">{card.name}</span>
							<LevelBadge level={card.level} />
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

export function TradePanel({
	trade,
	settled,
	youUserId,
	onOffer,
	onConfirm,
	onClose,
}: {
	trade: TradeState
	settled: boolean
	youUserId: string
	onOffer: (cardIds: string[]) => void
	onConfirm: (confirmed: boolean) => void
	onClose: () => void
}) {
	const [cards, setCards] = useState<Card[] | null>(null)
	const [picked, setPicked] = useState<string[]>([])

	const mine = trade.sides.find((side) => side.userId === youUserId) ?? trade.sides[0]
	const theirs = trade.sides.find((side) => side.userId !== youUserId) ?? trade.sides[1]

	// The collection is reloaded when the trade settles: cards have changed hands.
	useEffect(() => {
		let cancelled = false
		fetchCards()
			.then(({ cards: found }) => !cancelled && setCards(found))
			.catch(() => !cancelled && setCards([]))
		return () => {
			cancelled = true
		}
	}, [settled])

	const toggle = (cardId: string) => {
		const next = picked.includes(cardId) ? picked.filter((id) => id !== cardId) : [...picked, cardId]
		setPicked(next)
		onOffer(next)
	}

	// A card being treated at the centre is not in its owner's hands to give.
	const offerable = cards?.filter((card) => !card.inCare) ?? []

	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
			<section
				role="dialog"
				aria-label={`Échange avec ${theirs.name}`}
				className="my-auto flex max-h-[88dvh] w-full max-w-4xl flex-col rounded-xl border border-white/10 bg-[#141c17] p-5 text-slate-100 shadow-2xl"
			>
				<header className="flex shrink-0 items-start justify-between gap-3">
					<div>
						<Breadcrumb
							trail={[
								{ label: 'Carte', onClick: onClose },
								{ label: `Échange avec ${theirs.name}` },
							]}
							icon={GiTrade}
							tone="text-sky-300"
						/>
						<p className="mt-1 text-base text-slate-400">
							Toute modification d’une offre annule les deux confirmations.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-2 py-1 text-base text-slate-400 hover:bg-white/10 hover:text-white"
					>
						{settled ? 'Fermer' : 'Quitter'}
					</button>
				</header>

				<div className="mt-4 flex shrink-0 flex-wrap gap-3">
					<Offer side={mine} mine />
					<Offer side={theirs} mine={false} />
				</div>

				{settled ? (
					<p className="mt-4 shrink-0 rounded-lg bg-emerald-500/15 p-4 text-center text-lg font-semibold text-emerald-200">
						Échange conclu — les cartes ont changé de dresseur.
					</p>
				) : (
					<>
						<h3 className="mt-4 shrink-0 text-sm uppercase tracking-wide text-slate-500">
							Tes cartes {cards && `(${offerable.length})`}
						</h3>
						<ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
							<li className="flex flex-wrap justify-center gap-2">
								{cards === null ? (
									<span className="py-8 text-base text-slate-500">Chargement…</span>
								) : (
									offerable.map((card) => (
										<button
											key={card.id}
											type="button"
											onClick={() => toggle(card.id)}
											className={`rounded-lg transition ${
												picked.includes(card.id)
													? 'ring-2 ring-sky-400'
													: 'opacity-80 hover:opacity-100'
											}`}
										>
											<CardFace card={card} />
										</button>
									))
								)}
							</li>
						</ul>

						<button
							type="button"
							onClick={() => onConfirm(!mine.confirmed)}
							className={`mt-4 w-full shrink-0 rounded-md px-4 py-3 text-base font-semibold transition ${
								mine.confirmed
									? 'border border-white/15 bg-black/30 text-slate-200 hover:bg-black/50'
									: 'bg-sky-500 text-sky-950 hover:bg-sky-400'
							}`}
						>
							{mine.confirmed ? 'Annuler ma confirmation' : 'Confirmer l’échange'}
						</button>
					</>
				)}
			</section>
		</div>
	)
}
