import { useEffect, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { CanvasTexture, NearestFilter, SRGBColorSpace, type Texture } from 'three'

import { ATLAS_URL } from './tileset'
import { buildAtlasCanvas } from './extraTiles'

/**
 * The tile sheet, with the hand-painted tiles merged into it.
 *
 * `useTexture` suspends until the PNG has decoded, so by the time this runs
 * the image is ready to be drawn into a canvas. The result is one texture for
 * the whole map — the painted cells are simply part of the sheet.
 */
export function useAtlasTexture(): Texture {
	const loaded = useTexture(ATLAS_URL)

	const texture = useMemo(() => {
		const source = loaded.image as HTMLImageElement
		const next = new CanvasTexture(buildAtlasCanvas(source))
		next.magFilter = NearestFilter
		next.minFilter = NearestFilter
		next.generateMipmaps = false
		next.colorSpace = SRGBColorSpace
		return next
	}, [loaded])

	useEffect(() => () => texture.dispose(), [texture])

	return texture
}
