'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { joinTable } from '@/@shared/table/connection';
import type { LiveState } from '@/server/session';
import { getLiveStateAction } from '@/@creator/campaign/actions';

/**
 * How often to re-read anyway.
 *
 * `FLOOR_MS` runs while the stream is up. It is not a legacy path waiting to
 * be deleted: the design depends on every mutating server function calling
 * `bumpVersion`, and the day somebody adds a write and forgets, this is what
 * stops a table freezing mid-fight instead of merely lagging. Thirty seconds
 * of staleness is a bug report; a frozen initiative order is a ruined
 * session.
 *
 * `FALLBACK_MS` is the old cadence, used only when the stream is down.
 */
const FLOOR_MS = 30_000;
const FALLBACK_MS = 3_000;

/**
 * The campaign's live state.
 *
 * The stream tells this hook *that* something changed and never *what* — the
 * frame carries a version number and nothing else — so the answer still comes
 * back through `getLiveState`, which is role-filtered. That is the point:
 * there is exactly one place that decides what a player may see, and adding a
 * transport did not add a second.
 *
 * The return shape is unchanged from the polling version, which is the promise
 * `src/db/README.md` made to consumers when it described this swap.
 */
export function useCampaignLive(campaignId: string) {
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const inFlight = useRef(false);
  const missed = useRef(false);

  const refresh = useCallback(async () => {
    /*
     * A nudge that lands mid-read is remembered rather than dropped. Polling
     * could throw one away safely — another poll was three seconds behind it —
     * but a stream may go quiet for minutes afterwards, and the discarded
     * nudge would be the last word on a round that had already moved on.
     */
    if (inFlight.current) {
      missed.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        missed.current = false;
        setState(await getLiveStateAction(campaignId));
      } while (missed.current);
      setError(null);
    } catch {
      setError('Lost connection to the session.');
    } finally {
      inFlight.current = false;
      missed.current = false;
    }
  }, [campaignId]);

  // The stream. One per table per browser, owned by `connection.ts`.
  useEffect(() => {
    return joinTable(campaignId, frame => {
      switch (frame.kind) {
        case 'open':
          setConnected(true);
          refresh();
          break;
        case 'closed':
          setConnected(false);
          break;
        case 'state':
        case 'resync':
          refresh();
          break;
        case 'event':
          // Announcements are drawn by the table layer, not here. An event
          // never carries state, so there is nothing to re-read for it.
          break;
      }
    });
  }, [campaignId, refresh]);

  /*
   * The floor. Kept from the polling version, including the visibility
   * handling: a hidden tab holds its stream open — that is what makes coming
   * back instant — but there is no reason to re-read behind somebody's back.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const period = connected ? FLOOR_MS : FALLBACK_MS;

    const start = () => {
      if (timer) return;
      refresh();
      timer = setInterval(refresh, period);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, connected]);

  return { state, error, refresh, connected };
}
