/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Applies any pending database migrations so the app "just works" after a
 * pull, and starts the Discord reminder loop.
 *
 * Everything lives in `instrumentation-node.ts`, imported only inside this
 * branch: this file is also compiled for the Edge runtime, and the bundler
 * only leaves out a Node-only import that sits inside a `NEXT_RUNTIME`
 * check it can see.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNode } = await import('./instrumentation-node');
    startNode();
  }
}
