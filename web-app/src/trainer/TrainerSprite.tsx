import { useEffect, useMemo } from 'react'
import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'

import { appearanceKey, type Appearance } from './appearance'
import { FRAMES, FRAME_H, FRAME_W, VIEWS, VIEW_INDEX, drawTrainer, type View } from './drawTrainer'

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
	view = 'front',
}: {
	appearance: Appearance
	/** Mirrors the sprite. The profile art faces right, so this turns it round. */
	facingLeft: boolean
	/** 0 = standing, 1 and 2 are the two stride poses. */
	frame: number
	/** Which way the trainer is turned; `side` is the profile. */
	view?: View
}) {
	const key = appearanceKey(appearance)

	const texture = useMemo(() => {
		const canvas = drawTrainer(appearance)
		const next = new CanvasTexture(canvas)
		next.magFilter = NearestFilter
		next.minFilter = NearestFilter
		next.generateMipmaps = false
		next.colorSpace = SRGBColorSpace
		next.repeat.set(1 / (FRAMES * VIEWS), 1)
		return next
		// `key` is the appearance's identity; the object itself is recreated on
		// every snapshot and would thrash the texture.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key])

	useEffect(() => () => texture.dispose(), [texture])

	// Offset picks the cell; flipping is done by the mesh scale, not the UVs,
	// so the two never fight over the same value.
	const cell = VIEW_INDEX[view] * FRAMES + (frame % FRAMES)
	texture.offset.x = cell / (FRAMES * VIEWS)

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
