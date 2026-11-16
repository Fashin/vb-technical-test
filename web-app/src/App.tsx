import { AuthProvider, AuthScreen, useAuth } from './auth'
import { MapScene } from './map'

function Game() {
	const { status } = useAuth()

	if (status === 'checking') {
		return (
			<div className="flex h-full w-full items-center justify-center bg-[#121a12] text-base text-slate-300">
				Reconnexion…
			</div>
		)
	}

	if (status === 'anonymous') return <AuthScreen />

	return (
		<div className="h-full w-full overflow-hidden">
			<MapScene />
		</div>
	)
}

export default function App() {
	return (
		<AuthProvider>
			<Game />
		</AuthProvider>
	)
}
