import { useEffect } from 'react'

/**
 * Close a panel on Escape, from anywhere inside it.
 *
 * The listener goes on the window rather than on the panel's own wrapper: a
 * keydown raised inside a focused text field does not reliably reach that
 * wrapper, so a player typing in a form could not dismiss the dialog with the
 * key everybody expects. Capture phase, so it fires before a field handles it.
 */
export function useEscapeToClose(onClose: () => void): void {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.stopPropagation()
			onClose()
		}

		window.addEventListener('keydown', onKeyDown, true)
		return () => window.removeEventListener('keydown', onKeyDown, true)
	}, [onClose])
}
