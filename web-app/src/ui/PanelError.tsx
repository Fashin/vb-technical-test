/**
 * Overlay shown when one of the game's panels crashes while rendering.
 *
 * A panel is a leaf of the interface: losing it should cost the player that
 * panel, not the session. Closing clears whatever opened it and remounts the
 * subtree, so the map, the HUD and the connection are all still there
 * afterwards — the opposite of the blank page a crash gives without a boundary.
 */
export function PanelError({ error, onClose }: { error: Error; onClose: () => void }) {
	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
			<div className="max-w-sm rounded-xl border border-white/10 bg-[#141c17] p-6 text-slate-300">
				<h2 className="text-lg font-semibold text-white">Ce panneau a rencontré une erreur</h2>

				<p className="mt-2 text-base">
					Tu peux le fermer et continuer à jouer&nbsp;; ta progression n’est pas touchée.
				</p>

				<p className="mt-4 break-words rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-500">
					{error.message}
				</p>

				<button
					type="button"
					onClick={onClose}
					className="mt-5 rounded-lg border border-white/15 bg-black/55 px-4 py-2 text-base text-slate-200
						transition hover:border-white/40 hover:bg-black/75 hover:text-white"
				>
					Fermer
				</button>
			</div>
		</div>
	)
}
