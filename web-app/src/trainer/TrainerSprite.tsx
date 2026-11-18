import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'

import { appearanceKey, type Appearance } from './appearance'
import {
	AURA_FPS,
	CELL_H,
	CELL_W,
	FRAMES,
	FRAME_H,
	PAD_BOTTOM,
	VIEWS,
	VIEW_INDEX,
	auraPhases,
	drawTrainer,
	type View,
} from './drawTrainer'

/** World height of a trainer, in tiles. Roughly a head and a half above the grid. */
export const TRAINER_HEIGHT = 1.5

/** One sprite pixel, in tiles. The body sets the scale; the cell follows it. */
const UNIT = TRAINER_HEIGHT / FRAME_H

/**
 * The billboard is the whole cell, not just the body.
 *
 * The cell carries empty room around the body for the aura to burn in, so the
 * quad has to be that much bigger or the flames would be cropped. The body
 * itself keeps the size and the ground contact it always had: the quad is
 * raised by half its height and then dropped back by the padding below the
 * shoes, which puts the feet exactly where they used to be.
 */
const PLANE_W = CELL_W * UNIT
const PLANE_H = CELL_H * UNIT
const PLANE_Y = PLANE_H / 2 - PAD_BOTTOM * UNIT

/** World width of the billboard, in tiles. */
export const TRAINER_WIDTH = PLANE_W

/**
 * Billboard showing a procedurally drawn trainer.
 *
 * The texture is rebuilt only when the appearance actually changes - every
 * remote player holds its own, since each one carries its own UV offset for
 * the walk cycle and for the flame.
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
	const phases = auraPhases(appearance)
	const columns = FRAMES * VIEWS * phases

	const texture = useMemo(() => {
		const canvas = drawTrainer(appearance)
		const next = new CanvasTexture(canvas)
		next.magFilter = NearestFilter
		next.minFilter = NearestFilter
		next.generateMipmaps = false
		next.colorSpace = SRGBColorSpace
		next.repeat.set(1 / columns, 1)
		return next
		// `key` is the appearance's identity; the object itself is recreated on
		// every snapshot and would thrash the texture. `columns` is derived
		// from it, so it moves in step.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key])

	useEffect(() => () => texture.dispose(), [texture])

	// Offset picks the cell; flipping is done by the mesh scale, not the UVs,
	// so the two never fight over the same value.
	const pose = VIEW_INDEX[view] * FRAMES + (frame % FRAMES)
	texture.offset.x = (pose * phases) / columns

	/**
	 * The pose, read by the animation loop rather than closed over.
	 *
	 * The flame advances on a clock of its own, so it cannot wait for a React
	 * render to learn which way the trainer turned.
	 */
	const poseRef = useRef(pose)
	poseRef.current = pose

	/**
	 * Where in the flame's cycle this particular trainer starts.
	 *
	 * Every sprite shares the scene's clock, and without this a crowd pulsed
	 * in perfect unison, which reads as a strobe rather than as fire.
	 */
	const seed = useRef(Math.random())

	useFrame(({ clock }) => {
		const phase =
			phases === 1 ? 0 : Math.floor(clock.elapsedTime * AURA_FPS + seed.current * phases) % phases
		texture.offset.x = (poseRef.current * phases + phase) / columns
	})

	return (
		<mesh position={[0, PLANE_Y, 0]} scale={[facingLeft ? -PLANE_W : PLANE_W, PLANE_H, 1]}>
			<planeGeometry args={[1, 1]} />
			<meshBasicMaterial map={texture} alphaTest={0.5} toneMapped={false} transparent />
		</mesh>
	)
}
