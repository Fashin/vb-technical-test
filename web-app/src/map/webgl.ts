/**
 * Whether this browser can actually hand out the context the renderer needs.
 *
 * A machine can have WebGL compiled in and still fail to create a context —
 * hardware acceleration switched off, a driver Chrome has blocklisted, a
 * hybrid GPU the browser never reaches, a software renderer that fails to
 * bind. `<Canvas>` answers that case by throwing during render, which takes
 * the whole app down, so probe for it first and show something readable
 * instead.
 *
 * The probe asks for **WebGL 2 only**: three.js dropped WebGL 1 in r163, so a
 * browser that offers nothing but `webgl` cannot run this scene either, and
 * accepting it here would only move the crash one step later.
 *
 * The probe context is released at once — contexts are a scarce resource and
 * browsers drop the oldest one when too many are alive, which would cost the
 * real scene its own. The answer is cached because it cannot change without a
 * page reload, and because each probe is a real allocation.
 */
let cached: boolean | undefined

export function supportsWebGL(): boolean {
	if (cached !== undefined) return cached
	try {
		const gl = document.createElement('canvas').getContext('webgl2')
		cached = gl !== null
		// `WEBGL_lose_context` is how a page gives a context back by hand; it is
		// not guaranteed to exist, and dropping the canvas is enough without it.
		;(gl?.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext()
	} catch {
		// Some builds throw rather than return null when the GPU process is gone.
		cached = false
	}
	return cached
}
