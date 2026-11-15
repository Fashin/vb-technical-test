import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Vector3 } from 'three'

import { useAuth } from '../auth'
import { BoosterPanel, useBoosters } from '../boosters'
import { CarePanel } from '../care'
import { AchievementsPanel } from '../achievements'
import { ArenaPanel } from '../arena'
import { BarberPanel } from '../barber'
import { CollectionPanel } from '../collection'
import { OptionsPanel } from '../options'
import { DuelView, InvitationPrompt, NeighbourPrompt, TradePanel, usePvp } from '../pvp'
import type { WorldPlayerState } from '../realtime'
import { RankingPanel } from '../ranking'
import { TeamPanel } from '../teams'
import { TrainingPanel } from '../training'
import { HudBar, type HudAction } from '../hud'
import { useWorld } from '../world'
import { CameraFollow, GROUND_Z_STRETCH, type MapBounds } from './CameraFollow'
import { ACTOR_Z } from './depth'
import { campAt, centerAt, type TileMapData } from './mapData'
import { Minimap } from './Minimap'
import { Player } from './Player'
import { RemotePlayer } from './RemotePlayer'
import { TileMapMesh } from './TileMapMesh'
import { useAtlasTexture } from './useAtlasTexture'
import { usePlayerControls } from './usePlayerControls'

/** Forward nudge applied to the character by `Player`; used for the camera's first frame. */
const PLAYER_Z_OFFSET = ACTOR_Z

function Route({ map }: { map: TileMapData }) {
	return <TileMapMesh map={map} texture={useAtlasTexture()} />
}

interface MapSceneProps {
	className?: string
}

/**
 * The shared overworld.
 *
 * The map, every position and the right to move all come from the server. This
 * component only draws them — plus one optimistic exception: our own character
 * walks the instant a key is pressed, and snaps back if the server disagrees.
 * Without that, every step would cost a round trip.
 *
 * Keyboard input is bound to this wrapper, not to `window`, so the arrow keys
 * only act once the map is focused.
 */
export function MapScene({ className }: MapSceneProps) {
	const { user, logout } = useAuth()
	const { status, error, map, speed, me, others, move, correction, announceProfile } = useWorld(Boolean(user))
	const { held, tapped, onKeyDown, onKeyUp, onBlur } = usePlayerControls()
	// Which HUD entry is selected. The panels themselves do not exist yet, so
	// clicking one only lights it up — and clicking it again puts it away.
	const [panel, setPanel] = useState<HudAction | null>(null)
	const boosters = useBoosters(Boolean(user))
	const pvp = usePvp()

	// Training camps are entered by walking onto them, so the map itself is the
	// menu. `me` is the server's confirmed tile, which is also what it checks
	// the session against — the hut cannot be opened from across the map.
/** Tiles within which two trainers can interact — mirrors `pvp/encounters.ts`. */
const REACH = 2

function nearestNeighbour(me: WorldPlayerState, others: Map<string, WorldPlayerState>) {
	let best: WorldPlayerState | null = null
	let bestDistance = Infinity

	for (const other of others.values()) {
		const dx = Math.abs(other.x - me.x)
		const dy = Math.abs(other.y - me.y)
		if (dx > REACH || dy > REACH) continue

		const distance = dx + dy
		if (distance < bestDistance) {
			best = other
			bestDistance = distance
		}
	}

	return best
}

	const [campId, setCampId] = useState<string | null>(null)
	const [atCenter, setAtCenter] = useState(false)
	/** The element the keyboard is read from; panels take the focus away from it. */
	const scene = useRef<HTMLDivElement>(null)
	const standingOn = map && me ? (campAt(map, me.x, me.y) ?? centerAt(map, me.x, me.y)) : null
	const onCenter = map && me ? centerAt(map, me.x, me.y) !== null : false
	const cameFrom = useRef<string | null>(null)

	// Encounters happen where the players are, so the map is the lobby.
	const neighbour = me ? nearestNeighbour(me, others) : null

	/**
	 * Everything that is currently sitting over the map and holding the focus.
	 *
	 * Joined into a string rather than counted, so the effect below re-runs on
	 * *which* overlay is open, not merely on how many.
	 */
	const overlay = [
		panel,
		campId && 'camp',
		atCenter && 'care',
		pvp.duel && 'duel',
		pvp.trade && 'trade',
		pvp.invitation && 'invitation',
	]
		.filter(Boolean)
		.join(',')

	/*
	 * Give the keyboard back once nothing is covering the map.
	 *
	 * Arrow keys and ZQSD are read from the wrapper below, and panels render
	 * inside it: clicking "Fermer" puts the focus on that button, and unmounting
	 * it drops the focus onto `document.body` — outside the wrapper, where key
	 * events never reach it. The character would stop walking until the player
	 * clicked the map again. Running on mount too is a bonus: the map is live
	 * straight away instead of waiting for a first click.
	 */
	useEffect(() => {
		if (overlay === '') scene.current?.focus()
	}, [overlay])

	useEffect(() => {
		const arrived = standingOn?.id ?? null
		// Rising edge only: stepping onto a building opens it, but closing the
		// panel while still standing on it must not reopen it on the next render.
		if (arrived && arrived !== cameFrom.current) {
			if (onCenter) setAtCenter(true)
			else setCampId(arrived)
			setPanel(null)
		}
		cameFrom.current = arrived
	}, [standingOn?.id, onCenter])

	// Captured once: `Player` owns its position from here on, and the server
	// corrects it through `correction` rather than by re-mounting the component.
	const spawn = useRef<{ x: number; y: number } | null>(null)
	if (me && !spawn.current) spawn.current = { x: me.x, y: me.y }

	const playerPosition = useRef(new Vector3())
	const cameraSeeded = useRef(false)

	// The map is built in tile space and centred on the origin here. Z is also
	// stretched so the camera's tilt does not squash the ground — see
	// GROUND_Z_STRETCH. The offset uses the *stretched* depth, otherwise the
	// scale would push the map off-centre instead of growing it in place.
	const depth = (map?.height ?? 0) * GROUND_Z_STRETCH
	const centre: [number, number, number] = map ? [-map.width / 2, 0, -depth / 2] : [0, 0, 0]

	const bounds: MapBounds = useMemo(
		() => ({
			minX: -(map?.width ?? 0) / 2,
			maxX: (map?.width ?? 0) / 2,
			// World units, so the stretch counts: a bound in tile units would let
			// the camera stop short and show the void past the edge.
			minZ: -((map?.height ?? 0) * GROUND_Z_STRETCH) / 2,
			maxZ: ((map?.height ?? 0) * GROUND_Z_STRETCH) / 2,
		}),
		[map?.width, map?.height],
	)

	// Seed the camera on the spawn tile once, so the first frame is already framed.
	if (map && spawn.current && !cameraSeeded.current) {
		cameraSeeded.current = true
		playerPosition.current.set(
			spawn.current.x + 0.5 + centre[0],
			0,
			(spawn.current.y + PLAYER_Z_OFFSET) * GROUND_Z_STRETCH + centre[2],
		)
	}

	const ready = status === 'joined' && map && me && spawn.current

	return (
		<div
			ref={scene}
			className={`relative h-full w-full bg-[#121a12] outline-none ${className ?? ''}`}
			tabIndex={0}
			onPointerDown={(event) => event.currentTarget.focus()}
			onKeyDown={onKeyDown}
			onKeyUp={onKeyUp}
			onBlur={onBlur}
		>
			{ready && (
				<Canvas dpr={[1, 2]} camera={{ position: [0, 9, 9], fov: 35 }} gl={{ antialias: false }}>
					<color attach="background" args={['#121a12']} />
					<Suspense fallback={null}>
						<group position={centre} scale={[1, 1, GROUND_Z_STRETCH]}>
							<Route map={map} />
							<Player
								map={map}
								held={held}
								tapped={tapped}
								appearance={me.appearance}
								start={spawn.current ?? undefined}
								tracker={playerPosition}
								speed={speed}
								onStep={move}
								correction={correction}
							/>
							{[...others.values()].map((player) => (
								<RemotePlayer key={player.id} player={player} speed={speed} />
							))}
						</group>
					</Suspense>
					<CameraFollow target={playerPosition} bounds={bounds} />
				</Canvas>
			)}

			{!ready && (
				<div className="flex h-full w-full items-center justify-center text-base text-slate-300">
					{status === 'error' ? (error ?? 'Serveur injoignable') : 'Connexion au monde…'}
				</div>
			)}

			<div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 text-sm text-white">
				<span className="rounded bg-black/60 px-2 py-1">
					{user?.displayName}
					{others.size > 0 && ` · ${others.size} autre${others.size > 1 ? 's' : ''} en ligne`}
				</span>
				<button
					type="button"
					onClick={() => void logout()}
					className="pointer-events-auto rounded bg-black/60 px-2 py-1 hover:bg-black/80"
				>
					Déconnexion
				</button>
			</div>

			{ready && map && <Minimap map={map} me={me} others={others} />}

			{standingOn && !campId && !atCenter ? (
				<button
					type="button"
					onClick={() => (onCenter ? setAtCenter(true) : setCampId(standingOn.id))}
					className={`absolute bottom-2 left-1/2 -translate-x-1/2 rounded px-3 py-1 text-sm font-medium ${
						onCenter ? 'bg-red-400/90 text-red-950 hover:bg-red-300' : 'bg-sky-500/90 text-sky-950 hover:bg-sky-400'
					}`}
				>
					{onCenter ? 'Entrer dans le centre de soins' : 'Entrer dans le camp d’entraînement'}
				</button>
			) : (
				<p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-sm text-white">
					Déplace-toi avec les flèches ou ZQSD / WASD
				</p>
			)}

			<HudBar
				active={panel}
				badges={{ booster: boosters.state?.pending ?? 0 }}
				onSelect={(action) => setPanel(panel === action ? null : action)}
			/>

			{panel === 'booster' && <BoosterPanel boosters={boosters} onClose={() => setPanel(null)} />}
			{panel === 'collection' && <CollectionPanel onClose={() => setPanel(null)} />}
			{panel === 'barber' && <BarberPanel onClose={() => setPanel(null)} onSaved={(appearance) => announceProfile({ appearance })} />}
			{panel === 'team' && <TeamPanel onClose={() => setPanel(null)} />}
			{panel === 'arena' && <ArenaPanel onClose={() => setPanel(null)} onRewarded={boosters.refresh} />}
			{panel === 'ranking' && <RankingPanel onClose={() => setPanel(null)} />}
			{panel === 'achievements' && <AchievementsPanel onClose={() => setPanel(null)} />}
			{/* Keyed by camp: walking from one hut to another starts a clean panel
			    rather than carrying over the previous camp's session and settings. */}
			{/* Encounters: offered to a neighbour, or offered by one. */}
			{ready && pvp.invitation ? (
				<InvitationPrompt
					invitation={pvp.invitation}
					onRespond={(accept) => pvp.respond(pvp.invitation!.id, accept, pvp.invitation!.kind)}
				/>
			) : (
				ready &&
				neighbour &&
				!pvp.duel &&
				!pvp.trade && (
					<NeighbourPrompt
						neighbour={neighbour}
						busy={pvp.awaiting}
						onInvite={(kind) => pvp.invite(neighbour.userId, kind)}
					/>
				)
			)}

			{pvp.error && (
				<button
					type="button"
					onClick={pvp.dismissError}
					className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded bg-red-500/90 px-3 py-1 text-sm font-medium text-red-950"
				>
					{pvp.error}
				</button>
			)}

			{pvp.duel && <DuelView duel={pvp.duel} onClose={pvp.dismissDuel} />}

			{pvp.trade && user && (
				<TradePanel
					trade={pvp.trade}
					settled={pvp.traded}
					youUserId={user.id}
					onOffer={pvp.offer}
					onConfirm={pvp.confirm}
					onClose={pvp.leaveTrade}
				/>
			)}

			{campId && <TrainingPanel key={campId} campId={campId} onClose={() => setCampId(null)} />}

			{atCenter && <CarePanel onClose={() => setAtCenter(false)} />}

			{panel === 'options' && (
				<OptionsPanel onClose={() => setPanel(null)} onRenamed={(name) => announceProfile({ name })} />
			)}
		</div>
	)
}
