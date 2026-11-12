import { useState } from 'react'

import { useArenaRoom } from '../realtime'

/**
 * Scaffolding UI for the realtime lobby: create or join a room, pick a fighter,
 * toggle ready. Meant to prove the socket layer works end to end — the real
 * screens will consume `useArenaRoom` directly.
 */
export function MultiplayerPanel() {
	const { status, room, me, opponent, error, battleStarted, createRoom, joinRoom, pick, setReady, leaveRoom } =
		useArenaRoom()
	const [name, setName] = useState('Dresseur')
	const [code, setCode] = useState('')

	return (
		<div className="w-full max-w-xl p-4 text-sm text-slate-200 bg-slate-900 rounded-lg" data-testid="mp-panel">
			<div className="flex items-center justify-between mb-3">
				<span className="font-semibold">Multiplayer</span>
				<span data-testid="mp-status">socket: {status}</span>
			</div>

			{!room ? (
				<div className="flex flex-wrap gap-2">
					<input
						className="px-2 py-1 text-slate-900 rounded"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Your name"
					/>
					<button className="px-3 py-1 bg-sky-600 rounded" onClick={() => void createRoom(name)}>
						Create room
					</button>
					<input
						className="px-2 py-1 text-slate-900 rounded w-28"
						value={code}
						onChange={(e) => setCode(e.target.value)}
						placeholder="Room code"
					/>
					<button className="px-3 py-1 bg-emerald-600 rounded" onClick={() => void joinRoom(code, name)}>
						Join
					</button>
				</div>
			) : (
				<div className="space-y-2">
					<div>
						Room <span data-testid="mp-room" className="font-mono">{room.id}</span> — phase{' '}
						<span data-testid="mp-phase">{room.phase}</span>
						{battleStarted && <span data-testid="mp-battle"> — BATTLE!</span>}
					</div>
					<div data-testid="mp-players">
						{room.players.map((p) => (
							<div key={p.id}>
								{p.name}
								{p.id === me?.id ? ' (you)' : ''} — pokemon {p.pokedexId ?? '—'} — {p.ready ? 'ready' : 'not ready'}
							</div>
						))}
						{!opponent && <div className="italic opacity-70">waiting for an opponent…</div>}
					</div>
					<div className="flex gap-2">
						<button className="px-3 py-1 bg-sky-600 rounded" onClick={() => void pick(25)}>
							Pick #25
						</button>
						<button className="px-3 py-1 bg-amber-600 rounded" onClick={() => void setReady(!me?.ready)}>
							{me?.ready ? 'Unready' : 'Ready'}
						</button>
						<button className="px-3 py-1 bg-rose-700 rounded" onClick={() => void leaveRoom()}>
							Leave
						</button>
					</div>
				</div>
			)}

			{error && (
				<div data-testid="mp-error" className="mt-2 text-rose-400">
					{error.code}: {error.message}
				</div>
			)}
		</div>
	)
}
