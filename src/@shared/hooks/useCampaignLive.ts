'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LiveState } from '@/server/session';
import { getLiveStateAction } from '@/@creator/campaign/actions';

const POLL_MS = 3000;

/**
 * Polls the campaign live state (~every 3s) while the view is mounted and the
 * tab is visible. Swap the fetch for an SSE stream later without touching
 * consumers — see src/db/README.md.
 */
export function useCampaignLive(campaignId: string) {
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setState(await getLiveStateAction(campaignId));
      setError(null);
    } catch {
      setError('Lost connection to the session.');
    } finally {
      inFlight.current = false;
    }
  }, [campaignId]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      refresh();
      timer = setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  return { state, error, refresh };
}
