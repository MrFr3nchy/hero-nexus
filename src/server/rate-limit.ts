/**
 * In-memory fixed-window rate limiter.
 *
 * Deliberately process-local: this app runs as a single Node process on a
 * single droplet (see `docs/ops/security-decisions.md`), so there is no shared
 * state to coordinate and no need for Redis. If the deployment ever grows a
 * second instance, this must be swapped for a shared store.
 *
 * Call from route handlers and server actions — never from `middleware.ts`,
 * whose runtime is not guaranteed to hold state between requests.
 */
import 'server-only';

interface Window {
  count: number;
  resetAt: number;
}

// Held on globalThis, not in module scope. Next bundles each route handler
// separately, so a module-level Map gives every route its own copy — and then
// `/api/reset-password` cannot clear a lockout recorded by the sign-in callback
// in `src/auth.ts`. Same pattern as the SQLite connection in `src/db/index.ts`.
const globalForRateLimit = globalThis as unknown as {
  __heroNexusRateLimit?: Map<string, Window>;
  __heroNexusRateLimitSweeper?: ReturnType<typeof setInterval>;
};

const windows: Map<string, Window> =
  (globalForRateLimit.__heroNexusRateLimit ??= new Map());

function ensureSweeper() {
  if (globalForRateLimit.__heroNexusRateLimitSweeper) return;
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, win] of windows) {
      if (win.resetAt <= now) windows.delete(key);
    }
  }, 60_000);
  // Don't keep the process alive for the sweeper alone.
  sweeper.unref?.();
  globalForRateLimit.__heroNexusRateLimitSweeper = sweeper;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry (0 when `ok`). */
  retryAfter: number;
}

/**
 * Record one hit against `key`. Returns `ok: false` once `limit` hits have
 * landed inside the current `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  ensureSweeper();
  const now = Date.now();
  const win = windows.get(key);

  if (!win || win.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (win.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((win.resetAt - now) / 1000) };
  }

  win.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Forget any recorded hits for `key`. */
export function clearRateLimit(key: string): void {
  windows.delete(key);
}

/**
 * Read-only check: is `key` already at or over `limit` for the current window?
 * Does not record a hit. Use to gate an action before deciding whether it
 * counts (e.g. only failed logins should increment the counter).
 */
export function isRateLimited(
  key: string,
  limit: number,
  _windowMs: number
): boolean {
  const win = windows.get(key);
  return Boolean(win && win.resetAt > Date.now() && win.count >= limit);
}

/** Common limiter presets, in `[limit, windowMs]` form. */
export const LIMITS = {
  /** Account creation, per IP. */
  register: [10, 60 * 60_000] as const,
  /** "Email me a link" endpoints, per IP. */
  mailByIp: [5, 60 * 60_000] as const,
  /** "Email me a link" endpoints, per target address. */
  mailByTarget: [3, 60 * 60_000] as const,
  /** Password reset submit / email-change confirm, per IP. */
  tokenSubmit: [10, 60 * 60_000] as const,
  /** Failed credential logins, per email address. */
  login: [10, 15 * 60_000] as const,
};
