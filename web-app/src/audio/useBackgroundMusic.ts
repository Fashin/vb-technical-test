import { useEffect } from 'react'

import { startMusic } from './music'

/**
 * Play the overworld loop for as long as the calling component is mounted.
 *
 * Mounted by the world itself, not by `App`: the music belongs to playing, so
 * the login screen stays quiet and leaving the map stops the loop.
 */
export function useBackgroundMusic(): void {
	useEffect(() => startMusic(), [])
}
