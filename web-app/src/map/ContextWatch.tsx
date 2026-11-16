import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * Reports a WebGL context the browser takes back at runtime.
 *
 * Losing the context is normal, not exceptional: a driver reset, a laptop
 * switching between its integrated and discrete GPU, the tab being
 * backgrounded for a long time, or simply too many live contexts on the page
 * are all enough. Nothing throws when it happens — the canvas just freezes on
 * its last frame, which looks exactly like the game hanging. Catching the
 * event lets the scene say so and offer to come back.
 *
 * `preventDefault` is what tells the browser the page intends to handle the
 * loss, without which a context can never be restored.
 */
export function ContextWatch({ onLost }: { onLost: () => void }) {
	const gl = useThree((state) => state.gl)

	useEffect(() => {
		const canvas = gl.domElement
		const lost = (event: Event) => {
			event.preventDefault()
			onLost()
		}
		canvas.addEventListener('webglcontextlost', lost)
		return () => canvas.removeEventListener('webglcontextlost', lost)
	}, [gl, onLost])

	return null
}
