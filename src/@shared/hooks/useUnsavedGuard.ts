'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Ask before the tab closes while an edit has not reached the server.
 *
 * The board editors debounce their saves, and a client-side route change
 * sends the waiting one on unmount. A real tab close cannot be trusted to
 * finish a server action, so the browser's own "leave this page?" prompt is
 * the only honest protection there. The ref is read when the tab is closing,
 * not when the hook ran, so a stroke begun after mount is still covered.
 */
export function useUnsavedGuard(dirty: RefObject<boolean>): void {
  useEffect(() => {
    const onBeforeUnload = (ev: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      ev.preventDefault();
      // Older Chromium still wants the legacy field set to show the prompt.
      ev.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
