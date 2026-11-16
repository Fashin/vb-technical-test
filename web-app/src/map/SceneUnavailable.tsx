/**
 * Why the 3D scene is not on screen.
 *
 * `webgl` is a hard prerequisite the machine does not meet, so the advice is
 * about settings and drivers. `lost` is the GPU taking the context away mid-
 * game (driver reset, laptop switching GPU, too many live contexts) — almost
 * always recoverable by remounting. `crashed` is anything else that threw on
 * the way up, typically a tile sheet that never arrived.
 */
export type SceneFailure = 'webgl' | 'lost' | 'crashed'

const COPY: Record<SceneFailure, { title: string; body: string }> = {
	webgl: {
		title: 'Affichage 3D indisponible',
		body: 'Ton navigateur n’a pas pu créer de contexte WebGL, dont la carte du monde a besoin. Le reste du jeu reste accessible depuis la barre du bas.',
	},
	lost: {
		title: 'Affichage 3D interrompu',
		body: 'Le navigateur a perdu l’accès à la carte graphique. C’est généralement temporaire : relance l’affichage.',
	},
	crashed: {
		title: 'La carte n’a pas pu être chargée',
		body: 'Une ressource de la carte manque ou n’a pas pu être lue. Le reste du jeu reste accessible depuis la barre du bas.',
	},
}

/**
 * Shown in place of the 3D scene when it cannot run.
 *
 * It names the cause and, for the hardware case, the two settings that fix it
 * nine times out of ten — because the alternative the user actually gets
 * otherwise is a blank screen and no idea whether the game or their machine is
 * at fault. The retry button remounts the scene, which is enough for a lost
 * context or a failed download.
 */
export function SceneUnavailable({
	reason = 'webgl',
	onRetry,
}: {
	reason?: SceneFailure
	onRetry?: () => void
}) {
	const { title, body } = COPY[reason]

	return (
		<div className="flex h-full w-full items-center justify-center bg-[#121a12] p-6">
			<div className="max-w-md rounded-xl border border-white/10 bg-black/40 p-6 text-slate-300">
				<h2 className="text-lg font-semibold text-white">{title}</h2>

				<p className="mt-2 text-base">{body}</p>

				{reason === 'webgl' && (
					<ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-400">
						<li>
							Active l’accélération graphique&nbsp;:{' '}
							<span className="text-slate-200">chrome://settings/system</span>, puis relance
							complètement le navigateur.
						</li>
						<li>
							Vérifie l’état du GPU sur <span className="text-slate-200">chrome://gpu</span> — la
							raison exacte y est indiquée.
						</li>
						<li>Sinon, essaie un autre navigateur ou mets à jour tes pilotes graphiques.</li>
					</ul>
				)}

				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="mt-5 rounded-lg border border-white/15 bg-black/55 px-4 py-2 text-base text-slate-200
							transition hover:border-white/40 hover:bg-black/75 hover:text-white"
					>
						Réessayer
					</button>
				)}
			</div>
		</div>
	)
}
