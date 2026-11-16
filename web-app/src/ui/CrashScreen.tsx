/**
 * Last-resort screen for a crash nothing closer to the failure caught.
 *
 * Its only job is to make sure the user never faces a blank page: it says the
 * app broke, offers the one action that reliably helps, and keeps the message
 * for support. The error text is shown on purpose — a user reporting "écran
 * blanc" tells us nothing, one quoting a line tells us where to look.
 */
export function CrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-[#121a12] p-6">
			<div className="max-w-md rounded-xl border border-white/10 bg-black/40 p-6 text-slate-300">
				<h1 className="text-lg font-semibold text-white">Le jeu a rencontré une erreur</h1>

				<p className="mt-2 text-base">
					Rien n’est perdu&nbsp;: ta progression est enregistrée côté serveur. Recharge la page
					pour reprendre.
				</p>

				<p className="mt-4 break-words rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-500">
					{error.message}
				</p>

				<div className="mt-5 flex gap-2">
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="rounded-lg border border-white/15 bg-black/55 px-4 py-2 text-base text-slate-200
							transition hover:border-white/40 hover:bg-black/75 hover:text-white"
					>
						Recharger
					</button>
					<button
						type="button"
						onClick={onRetry}
						className="rounded-lg px-4 py-2 text-base text-slate-400 transition hover:text-slate-200"
					>
						Réessayer
					</button>
				</div>
			</div>
		</div>
	)
}
