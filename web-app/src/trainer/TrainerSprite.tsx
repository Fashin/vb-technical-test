import { useEffect, useMemo } from 'react'
import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'

import { appearanceKey, type Appearance } from './appearance'
import { FRAMES, FRAME_H, FRAME_W, drawTrainer } from './drawTrainer'

/** World height of a trainer, in tiles. Roughly a head and a half above the grid. */
export const TRAINER_HEIGHT = 1.5
export const TRAINER_WIDTH = (TRAINER_HEIGHT * FRAME_W) / FRAME_H

/**
 * Billboard showing a procedurally drawn trainer.
 *
 * The texture is rebuilt only when the appearance actually changes — every
 * remote player holds its own, since each one carries its own UV offset for
 * the walk cycle.
 */
export function TrainerSprite({
	appearance,
	facingLeft,
	frame,
}: {
	appearance: Appearance
	facingLeft: boolean
	/** 0 = standing, 1 = mid-stride. */
	frame: number
}) {
	const key = appearanceKey(appearance)

	const texture = useMemo(() => {
		const canvas = drawTrainer(appearance)
		const next = new CanvasTexture(canvas)
		next.magFilter = NearestFilter
		next.minFilter = NearestFilter
		next.generateMipmaps = false
		next.colorSpace = SRGBColorSpace
		next.repeat.set(1 / FRAMES, 1)
		return next
		// `key` is the appearance's identity; the object itself is recreated on
		// every snapshot and would thrash the texture.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key])

	useEffect(() => () => texture.dispose(), [texture])

	// Offset picks the frame; flipping is done by the mesh scale, not the UVs,
	// so the two never fight over the same value.
	texture.offset.x = (frame % FRAMES) / FRAMES

	return (
		<mesh
			position={[0, TRAINER_HEIGHT / 2, 0]}
			scale={[facingLeft ? -TRAINER_WIDTH : TRAINER_WIDTH, TRAINER_HEIGHT, 1]}
		>
			<planeGeometry args={[1, 1]} />
			<meshBasicMaterial map={texture} alphaTest={0.5} toneMapped={false} transparent />
		</mesh>
	)
}
