/**
 * `/sw.js` — the service worker, with this build's id stamped in.
 *
 * Served from a route rather than `public/` so the bytes change on every
 * deploy without a step in the release script: `next build` writes a fresh
 * `.next/BUILD_ID`, this reads it, and a browser comparing the worker it
 * holds against this one sees a new worker and rolls forward. `no-cache`
 * so that comparison always reaches the server.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { serviceWorkerSource } from '@/@shared/offline/service-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let buildId: string | null = null;

function version(): string {
  if (buildId) return buildId;
  try {
    buildId = readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8')
      .trim()
      .slice(0, 64);
  } catch {
    buildId = 'dev';
  }
  return buildId;
}

export function GET() {
  return new Response(serviceWorkerSource(version()), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
}
