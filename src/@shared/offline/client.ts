/**
 * Offline mode — the browser half that is not the worker.
 *
 * Three small jobs: remember who was signed in on this device, so a dropped
 * connection does not read as "signed out" and bounce a player to /login;
 * tell the page when a read failed, so one banner can say so; and wipe every
 * cache on sign-out, because what was cached was filtered for the person who
 * fetched it.
 */
import type { SessionUser } from '@/@auth/types';

const LAST_USER = 'hero-nexus.last-user';
const LOST = 'hero-nexus:connection';

export function rememberUser(user: SessionUser): void {
  try {
    localStorage.setItem(LAST_USER, JSON.stringify(user));
  } catch {
    // Private window or blocked storage: offline mode simply has no fallback.
  }
}

export function lastUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER);
    if (!raw) return null;
    const u = JSON.parse(raw) as SessionUser;
    return u && typeof u.id === 'string' ? u : null;
  } catch {
    return null;
  }
}

export function forgetUser(): void {
  try {
    localStorage.removeItem(LAST_USER);
  } catch {
    // Nothing to forget.
  }
}

/** Say that a read reached the server, or did not. One banner listens. */
export function reportConnection(ok: boolean): void {
  window.dispatchEvent(new CustomEvent(LOST, { detail: ok }));
}

export function onConnection(fn: (ok: boolean) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<boolean>).detail);
  window.addEventListener(LOST, handler);
  return () => window.removeEventListener(LOST, handler);
}

/** Sign-out: every cache, the worker's record of who is signed in, the user. */
export async function clearOfflineData(): Promise<void> {
  forgetUser();
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: 'signout' });
  } catch {
    // No worker; the caches below are still ours to clear.
  }
  try {
    if ('caches' in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
  } catch {
    // Storage blocked: there is nothing cached either.
  }
}
