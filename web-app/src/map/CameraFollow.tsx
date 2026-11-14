import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { MutableRefObject } from 'react'

/** Camera tilt above the ground, in degrees. 45° keeps the billboards readable. */
export const TILT = 45

/**
 * How much the world is stretched along Z so the ground reads as square.
 *
 * Looking at the ground from `TILT` degrees compresses depth on screen by
 * `sin(TILT)`: a 1x1 tile would be drawn 1 wide and only 0.707 tall, i.e. 1.4
 * times wider than high. Billboards escape it — they face the camera and are
 * never laid flat — which is exactly what makes the squashed ground obvious
 * next to an upright character.
 *
 * Pre-stretching the ground by the inverse cancels the projection out. The
 * scene is scaled rather than the geometry rebuilt, so tile space stays
 * 1 unit per tile everywhere in the game logic.
 */
export const GROUND_Z_STRETCH = 1 / Math.sin(MathUtils.degToRad(TILT))
/** Preferred height above the ground; lowered automatically when the map is small. */
const PREFERRED_HEIGHT = 11

export interface MapBounds {
	minX: number
	maxX: number
	minZ: number
	maxZ: number
}

export interface CameraFollowProps {
	/** World position of the character, updated every frame by `Player`. */
	target: MutableRefObject<Vector3>
	/** World rectangle covered by the ground layer. */
	bounds: MapBounds
	/** Height above the ground when the map is large enough to allow it. */
	height?: number
}

function clamp(value: number, min: number, max: number) {
	// An empty range means the map is narrower than the view: centre instead.
	return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value))
}

/**
 * Keeps the character centred on screen, and keeps the whole frustum inside the
 * map so no off-map pixel is ever visible.
 *
 * The frustum's footprint on the ground plane is a trapezoid. Its three
 * dimensions — half-width at the far edge, distance to the far edge, distance
 * to the near edge — are all proportional to the camera height, so they are
 * computed once per unit of height, then scaled by the height that actually
 * fits the map. Clamping the look-at point by those same distances is what
 * stops the view at the borders.
 */
export function CameraFollow({ target, bounds, height: preferred = PREFERRED_HEIGHT }: CameraFollowProps) {
	const camera = useThree((state) => state.camera)
	const size = useThree((state) => state.size)

	useFrame(() => {
		if (!(camera instanceof PerspectiveCamera)) return

		const aspect = size.width / Math.max(1, size.height)
		const halfV = MathUtils.degToRad(camera.fov) / 2
		const halfH = Math.atan(Math.tan(halfV) * aspect)
		const tilt = MathUtils.degToRad(TILT)

		// Angles of the rays leaving the top and the bottom of the screen.
		const far = tilt - halfV
		const near = tilt + halfV

		const unitFar = 1 / Math.tan(far)
		const unitNear = 1 / Math.tan(near)
		const unitHalfWidth = Math.tan(halfH) / Math.sin(far)
		const unitDepth = unitFar - unitNear

		const spanX = bounds.maxX - bounds.minX
		const spanZ = bounds.maxZ - bounds.minZ
		// Pull back only as far as the map can fill; on a very wide window this
		// zooms in rather than revealing the void past the border.
		const h = Math.min(preferred, spanX / (2 * unitHalfWidth), spanZ / unitDepth)

		const halfWidth = unitHalfWidth * h
		const toFar = unitFar * h
		const toNear = unitNear * h
		// Horizontal distance from the look-at point back to the camera.
		const depth = h / Math.tan(tilt)

		const x = clamp(target.current.x, bounds.minX + halfWidth, bounds.maxX - halfWidth)
		const z = clamp(target.current.z, bounds.minZ - depth + toFar, bounds.maxZ - depth + toNear)

		camera.position.set(x, h, z + depth)
		camera.lookAt(x, 0, z)
	})

	return null
}
