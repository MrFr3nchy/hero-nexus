'use client';

/**
 * Whether this browser can stand the table up at all.
 *
 * Three logs to the console and then throws when it cannot get a WebGL
 * context, and in development that log alone raises the error overlay.
 * Asking the browser for a context on a scratch canvas first is quiet: a
 * `null` back is the whole answer, nothing is logged, and the surfaces
 * that offer "Stand it up" can offer it only where it will work. Asked
 * once and remembered; a GPU does not arrive mid-session.
 */
let known: boolean | null = null;

export function webglAvailable(): boolean {
  if (known !== null) return known;
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    const gl =
      c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ??
      c.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    known = gl !== null;
    // Give the context back straight away; the probe is not the table.
    const lose = (gl as WebGLRenderingContext | null)?.getExtension(
      'WEBGL_lose_context'
    );
    lose?.loseContext();
  } catch {
    known = false;
  }
  return known;
}
