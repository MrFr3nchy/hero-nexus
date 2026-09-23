'use client';

/**
 * Pings: somebody pointing at a tile, for a couple of seconds.
 *
 * A ping arrives as a table event and is never state, so it lives here for
 * `PING_MS` and then is gone. Both views of the board read the same list —
 * the flat board draws a ripple on the tile, the stood-up one a ring on the
 * ground — and neither keeps its own.
 */
import { useEffect, useRef, useState } from 'react';

import { joinTable } from '@/@shared/table/connection';

/** How long a ping stays on the board. */
export const PING_MS = 2000;

/** Older than this on arrival, a ping is a replay and is not drawn. */
const STALE_MS = 15_000;

export interface Ping {
  id: string;
  level: string;
  x: number;
  y: number;
  /** Who pointed. */
  name: string;
  /** `performance.now()` when it arrived, for the ripple's age. */
  born: number;
}

/**
 * The pings alive on one board.
 *
 * `knows` says whether the reader's document has a floor. A ping on a floor
 * the party has not been shown is dropped here rather than drawn, or the
 * mark would say that floor exists.
 */
export function usePings(
  campaignId: string,
  mapId: string | null,
  knows: (level: string) => boolean
): Ping[] {
  const [pings, setPings] = useState<Ping[]>([]);
  const knowsRef = useRef(knows);
  useEffect(() => {
    knowsRef.current = knows;
  }, [knows]);

  useEffect(() => {
    if (!mapId) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const leave = joinTable(campaignId, frame => {
      if (frame.kind !== 'event' || frame.event.kind !== 'ping') return;
      const e = frame.event;
      if (e.mapId !== mapId || !knowsRef.current(e.level)) return;
      // A reconnect replays what it missed; a ping from a while ago is not
      // somebody pointing now. Loose, because the two clocks differ.
      if (Date.now() - Date.parse(e.at) > STALE_MS) return;
      const ping: Ping = {
        id: e.id,
        level: e.level,
        x: e.x,
        y: e.y,
        name: e.name,
        born: performance.now(),
      };
      // One mark per tile: a second ping on the same spot restarts it.
      setPings(list => [
        ...list.filter(
          p =>
            p.id !== e.id &&
            !(p.level === e.level && p.x === e.x && p.y === e.y)
        ),
        ping,
      ]);
      const t = setTimeout(() => {
        timers.delete(t);
        setPings(list => list.filter(p => p.id !== ping.id));
      }, PING_MS);
      timers.add(t);
    });
    return () => {
      leave();
      for (const t of timers) clearTimeout(t);
      setPings([]);
    };
  }, [campaignId, mapId]);

  return pings;
}
