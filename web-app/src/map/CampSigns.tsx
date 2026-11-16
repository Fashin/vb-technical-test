import { Html } from '@react-three/drei'

import type { Camp } from '../training'
import { OBJECT_Z } from './depth'

/**
 * The level band of each training camp, painted in the world above its hut.
 *
 * A camp only teaches its own band, so "which camp is mine?" is the one
 * question the overworld has to answer — and it used to answer it only from
 * the inside: walk across the map, step on the hut, open the panel, read
 * "niveaux 46 – 65", walk away again. Four of the five camps were a wasted
 * trip. The sign says it from as far as the camera reaches.
 *
 * The verdicts are the server's own (`training/camps`, measured against the
 * active team), so a sign never disagrees with what the panel will say once
 * the player is standing on the hut.
 */

/**
 * How high above the hut the sign floats, in tiles.
 *
 * The hut is a two-cell billboard, so 2 is its ridge; a little above it clears
 * the banner without drifting off into the sky.
 */
const SIGN_HEIGHT = 2.5

/** What the sign is telling the player, which is also how it is coloured. */
type Verdict = 'locked' | 'open' | 'care' | 'done'

function verdictOf(camp: Camp): Verdict {
	if (!camp.unlocked) return 'locked'
	if (camp.allInCare) return 'care'
	// Nobody in the band *and* nobody of the band in care: outgrown, or not
	// reached — `exhausted` is the server's word for "nothing left here".
	if (camp.exhausted || camp.roster === 0) return 'done'
	return 'open'
}

/** The one line under the band: what would happen if you walked in now. */
function captionOf(camp: Camp, verdict: Verdict): string {
	switch (verdict) {
		case 'locked':
			return `niveau ${camp.minLevel} requis`
		case 'care':
			return 'blessés — centre de soins'
		case 'done':
			return 'rien à apprendre ici'
		case 'open':
			return camp.nextTrainee
				? `${camp.roster} au combat · ${camp.nextTrainee.name} niv. ${camp.nextTrainee.level}`
				: `${camp.roster} au combat`
	}
}

/**
 * Three tones, one per answer: come in, come back later, nothing for you.
 *
 * Deliberately readable without the text — the band is what is being scanned
 * for while walking, and the colour is what makes four huts dismissable at a
 * glance.
 */
const TONES: Record<Verdict, { frame: string; band: string; caption: string }> = {
	open: { frame: 'border-sky-400/60 bg-sky-950/85', band: 'text-sky-100', caption: 'text-sky-300/80' },
	locked: { frame: 'border-amber-400/50 bg-amber-950/85', band: 'text-amber-100', caption: 'text-amber-300/80' },
	care: { frame: 'border-red-400/50 bg-red-950/85', band: 'text-red-100', caption: 'text-red-300/80' },
	done: { frame: 'border-white/15 bg-black/80', band: 'text-slate-300', caption: 'text-slate-500' },
}

function CampSign({ camp }: { camp: Camp }) {
	const verdict = verdictOf(camp)
	const tone = TONES[verdict]

	return (
		<Html
			// Centred on the hut's own cell and pushed as deep into it as the
			// billboard itself, so the sign sits on the hut rather than beside it.
			position={[camp.x + 0.5, SIGN_HEIGHT, camp.y + OBJECT_Z]}
			center
			// Under the players' name tags: a trainer standing on the hut is the
			// thing you are looking at.
			zIndexRange={[8, 0]}
			className="pointer-events-none select-none"
		>
			<div
				className={`flex min-w-[7.5rem] flex-col items-center rounded-md border px-2 py-1 text-center shadow-lg backdrop-blur-sm ${tone.frame}`}
			>
				<span className="whitespace-nowrap text-[10px] uppercase tracking-wide text-slate-400">
					{camp.name}
				</span>
				{/* The reason this exists: the band, big enough to read from the
				    other side of the screen. */}
				<span className={`whitespace-nowrap text-sm font-bold tabular-nums ${tone.band}`}>
					Niv. {camp.minLevel} – {camp.maxLevel}
				</span>
				{/* The ceiling is one past the band, and that difference is what
				    sends the player to the next biome — so it is on the sign too. */}
				<span className="whitespace-nowrap text-[10px] tabular-nums text-slate-400">
					mène au {camp.ceiling}
				</span>
				<span className={`whitespace-nowrap text-[10px] ${tone.caption}`}>{captionOf(camp, verdict)}</span>
			</div>
		</Html>
	)
}

export function CampSigns({ camps }: { camps: Camp[] }) {
	return (
		<>
			{camps.map((camp) => (
				<CampSign key={camp.id} camp={camp} />
			))}
		</>
	)
}
