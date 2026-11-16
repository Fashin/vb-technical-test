import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
	children: ReactNode
	/**
	 * What to show instead of the children once they have thrown. Given the
	 * error and a `retry` that clears the boundary and mounts them again, for
	 * a failure that may well not repeat (a lost WebGL context, a fetch that
	 * timed out).
	 */
	fallback: (error: Error, retry: () => void) => ReactNode
	/** Called once per caught error, for logging. */
	onError?: (error: Error, info: ErrorInfo) => void
}

/**
 * Catches a render-time crash in its subtree and shows `fallback` in its place.
 *
 * Without one, React unmounts the whole tree when anything throws while
 * rendering and the user is left on a blank page with the reason only in the
 * console — which is exactly what a machine with no usable WebGL context gets
 * from `<Canvas>`. Keep the boundary close to the part that can fail so the
 * rest of the interface survives it.
 *
 * It only sees errors thrown during render, in a lifecycle or in a layout
 * effect; a rejected promise or an event handler has to report its own failure.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
	state: { error: Error | null } = { error: null }

	static getDerivedStateFromError(error: Error) {
		return { error }
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(error, info.componentStack)
		this.props.onError?.(error, info)
	}

	private retry = () => this.setState({ error: null })

	render() {
		const { error } = this.state
		return error ? this.props.fallback(error, this.retry) : this.props.children
	}
}
