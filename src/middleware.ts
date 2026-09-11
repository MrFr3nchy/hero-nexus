import NextAuth from 'next-auth';

import { authConfig } from './auth.config';

// Edge-safe: uses only `src/auth.config.ts` (no database).
// `callbacks.authorized` in that config decides which routes require a session.
export default NextAuth(authConfig).auth;

export const config = {
  // Node.js runtime (stable since Next 15.5) avoids maintaining a second,
  // edge-compatible build target alongside our Node-only server code (SQLite).
  runtime: 'nodejs',
  // Run on everything except Next internals, static assets, and the campaign
  // image routes. Those check the campaign role themselves on every request,
  // and a multipart upload above a few megabytes died inside the middleware
  // ("Response body object should not be disturbed or locked") before the
  // route that would have accepted it ever ran.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|api/campaigns/[^/]+/images|.*\\.png$).*)',
  ],
};
