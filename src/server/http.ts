/**
 * Small helpers shared by the public API route handlers.
 */
import 'server-only';

import { NextResponse } from 'next/server';

/**
 * Best-effort client IP for rate limiting. The app runs behind a reverse proxy
 * (Caddy) that overwrites `X-Forwarded-For`, so the first hop is trustworthy in
 * production. Locally there is no proxy and this falls back to `'local'`.
 *
 * Trusting `X-Forwarded-For` is only safe because the proxy sets it. Never
 * remove the proxy without also changing this. See `docs/ops/deploy.md`.
 */
export function requestIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() || 'local';
}

/** 429 with a `Retry-After` header. */
export function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please wait a bit and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
