'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/@auth/context';
import { StatusMark, StatusWord, staleFor } from '@/@shared/components/ui';
import { onConnection } from './client';

/**
 * Registers the service worker, tells it who is signed in, and says so when
 * the page is showing what this device last saw rather than what the server
 * says now.
 *
 * Production only: in development Turbopack serves unhashed chunks, and a
 * worker caching them would be a bug report about yesterday's code.
 */
export function OfflineSupport() {
  const { currentUser } = useAuth();
  const [offline, setOffline] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(err => {
      console.warn('[offline] service worker did not register', err);
    });
  }, []);

  // The worker keys its cache by this; a different id clears the others.
  const userId = currentUser?.id ?? null;
  useEffect(() => {
    if (!userId || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then(reg => reg.active?.postMessage({ type: 'user', id: userId }))
      .catch(() => {});
  }, [userId]);

  /*
   * Whether the network is there. `navigator.onLine` alone is not enough:
   * basement Wi-Fi reports "online" while every request fails. So a failed
   * read anywhere (`reportConnection`, an unhandled "Failed to fetch"), or
   * the worker saying it answered from cache, puts the banner up; and while
   * it is up, a tiny request every ten seconds is what takes it down.
   */
  useEffect(() => {
    const go = (down: boolean, at = Date.now()) => {
      setOffline(down);
      setSince(s => (down ? (s ?? at) : null));
    };
    if (!navigator.onLine) go(true);
    const off = () => go(true);
    const on = () => void probe();
    const probe = async () => {
      try {
        const res = await fetch('/manifest.webmanifest', {
          method: 'HEAD',
          cache: 'no-store',
        });
        if (res.ok) go(false);
      } catch {
        go(true);
      }
    };
    const rejected = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | undefined;
      if (r?.name === 'TypeError' && /fetch/i.test(r.message ?? '')) go(true);
    };
    const fromWorker = (e: MessageEvent) => {
      const m = e.data as { type?: string; offlineSince?: number };
      if (m?.type === 'status' && m.offlineSince) go(true, m.offlineSince);
    };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    window.addEventListener('unhandledrejection', rejected);
    navigator.serviceWorker?.addEventListener('message', fromWorker);
    navigator.serviceWorker?.ready
      .then(reg => reg.active?.postMessage({ type: 'status' }))
      .catch(() => {});
    const stop = onConnection(ok => go(!ok));
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
      window.removeEventListener('unhandledrejection', rejected);
      navigator.serviceWorker?.removeEventListener('message', fromWorker);
      stop();
    };
  }, []);

  // While down, ask every ten seconds whether the network is back.
  useEffect(() => {
    if (!offline) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch('/manifest.webmanifest', {
          method: 'HEAD',
          cache: 'no-store',
        });
        if (res.ok) {
          setOffline(false);
          setSince(null);
        }
      } catch {
        // Still down.
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [offline]);

  useEffect(() => {
    if (!offline) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [offline]);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-md border border-dotted border-warning bg-surface px-3 py-2 text-xs text-ink-muted shadow-md"
    >
      <StatusMark kind="stale" size={7} />
      <StatusWord
        kind="stale"
        detail={since ? staleFor(Math.max(0, now - since)) : undefined}
      />
      <span>
        Offline — showing what this device last saw. Changes will not save until
        you are back.
      </span>
    </div>
  );
}
