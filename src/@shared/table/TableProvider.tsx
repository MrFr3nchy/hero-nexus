'use client';

/**
 * The table, wherever the reader happens to be standing.
 *
 * Mounted once at the root beside `DiceTrayProvider`, and justified the same
 * way design language rule 4 justifies the tray: this is not a page's toy, it
 * is a moment over the whole window, raised by something somebody else did and
 * gone a few seconds later. That is the entire point — the complaint this work
 * answers is that a timer started by the DM only reached whoever was already
 * looking at the panel it lives in.
 *
 * Announcements are **not stored**. An event is a moment: missing one is
 * acceptable because the state it produced is still readable, and a store that
 * only ever holds derivable facts is a cache with a staleness bug in its
 * future — the reasoning `the-long-campaign` phase 9 recorded when it refused
 * a `notices` table. What does get a row is a request addressed at a person,
 * and that is the checks table, not this.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/@auth/context';
import { joinTable, type Seat } from './connection';
import { describe, type EventReading, type TableEvent } from './events';

export interface Announcement {
  /** The event's own id, so a replayed frame is recognised and dropped. */
  id: string;
  campaignId: string;
  event: TableEvent;
  reading: EventReading;
  at: number;
}

interface TableApi {
  /** On screen now. Short-lived: most go on their own after a few seconds. */
  announcements: Announcement[];
  /**
   * Everything heard since this tab opened, newest first.
   *
   * Kept only in memory and only for as long as the tab lives, which is the
   * honest lifetime of a moment. The feed panel reads this; anything a player
   * must still be able to find tomorrow is a row somewhere else.
   */
  history: Announcement[];
  dismiss(id: string): void;
  dismissAll(): void;
  /**
   * Every table this browser is currently listening to, and where the reader
   * sits at each. Read by the shell so it can offer a way back into the room.
   */
  seats: Record<string, Seat>;
  /** Register interest in a table. Returns the leave. Call from an effect. */
  attend(campaignId: string): () => void;
}

const TableContext = createContext<TableApi | null>(null);

/**
 * How long an announcement stays before it goes on its own.
 *
 * Longer than the dice tray's hold, because the tray is showing you something
 * you did and this is telling you something somebody else did — you have to
 * notice it first. Anything that asks something of the reader ignores this and
 * waits to be dismissed.
 */
const HOLD_MS = 8_000;

/**
 * How many may be on screen at once.
 *
 * A fight where five things happen in one round should not bury the window.
 * The oldest goes; the feed panel is where the whole traffic lives.
 */
const MAX_ON_SCREEN = 4;

/** Ids remembered for dedup, so a reconnect replay does not double-announce. */
const SEEN_LIMIT = 400;

/** How much of the evening the feed panel can scroll back through. */
const HISTORY_LIMIT = 200;

/**
 * One listener per table.
 *
 * A component rather than a loop inside an effect, so React handles the
 * add/remove as tables come and go and there is no hand-written diff of a
 * subscription list — the bug that shape always eventually has.
 */
function TableListener({
  campaignId,
  onEvent,
  onSeat,
}: {
  campaignId: string;
  onEvent: (campaignId: string, event: TableEvent) => void;
  onSeat: (campaignId: string, seat: Seat) => void;
}) {
  useEffect(() => {
    return joinTable(campaignId, frame => {
      if (frame.kind === 'open') onSeat(campaignId, frame.seat);
      if (frame.kind === 'event') onEvent(campaignId, frame.event);
    });
  }, [campaignId, onEvent, onSeat]);
  return null;
}

export function TableProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [tables, setTables] = useState<string[]>([]);
  const [seats, setSeats] = useState<Record<string, Seat>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [history, setHistory] = useState<Announcement[]>([]);

  const refs = useRef(new Map<string, number>());
  const seen = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Read inside `onEvent` without making it a dependency: re-creating the
  // callback on every seat change would tear down and re-open the listener.
  const seatsRef = useRef(seats);
  seatsRef.current = seats;

  const attend = useCallback((campaignId: string) => {
    const next = (refs.current.get(campaignId) ?? 0) + 1;
    refs.current.set(campaignId, next);
    if (next === 1) {
      setTables(list =>
        list.includes(campaignId) ? list : [...list, campaignId]
      );
    }
    return () => {
      const left = (refs.current.get(campaignId) ?? 1) - 1;
      refs.current.set(campaignId, Math.max(0, left));
      if (left <= 0) setTables(list => list.filter(id => id !== campaignId));
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setAnnouncements(list => list.filter(a => a.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    setAnnouncements([]);
  }, []);

  // Clearing the corner does not clear the record. The two are different
  // questions: one is "stop showing me this", the other is "what happened".

  const onSeat = useCallback((campaignId: string, seat: Seat) => {
    setSeats(current =>
      current[campaignId]?.characterId === seat.characterId &&
      current[campaignId]?.role === seat.role
        ? current
        : { ...current, [campaignId]: seat }
    );
  }, []);

  const onEvent = useCallback(
    (campaignId: string, event: TableEvent) => {
      if (seen.current.has(event.id)) return;
      seen.current.add(event.id);
      if (seen.current.size > SEEN_LIMIT) {
        // Oldest first: `Set` keeps insertion order, so this drops the ids
        // least likely to still be arriving.
        const excess = seen.current.size - SEEN_LIMIT;
        let dropped = 0;
        for (const id of seen.current) {
          if (dropped++ >= excess) break;
          seen.current.delete(id);
        }
      }

      const reading = describe(event, {
        userId: currentUser?.id ?? '',
        characterId: seatsRef.current[campaignId]?.characterId ?? null,
      });

      const announcement: Announcement = {
        id: event.id,
        campaignId,
        event,
        reading,
        at: Date.now(),
      };

      setHistory(list => [announcement, ...list].slice(0, HISTORY_LIMIT));

      setAnnouncements(list => {
        const next = [...list, announcement];
        /*
         * Trim the oldest thing that is *not* asking the reader for something.
         *
         * Trimming plainly from the front looked right until eight rolls
         * landed in three seconds and pushed the DM's question off the screen
         * — the one announcement in the stack that wanted an answer was the
         * first to go, evicted by exactly the noise a busy round produces. An
         * asking slip is only dropped when there is nothing else left to drop.
         */
        while (next.length > MAX_ON_SCREEN) {
          let index = next.findIndex(a => !a.reading.asks);
          if (index === -1) index = 0;
          const [gone] = next.splice(index, 1);
          if (!gone) break;
          const timer = timers.current.get(gone.id);
          if (timer) clearTimeout(timer);
          timers.current.delete(gone.id);
        }
        return next;
      });

      // Something that asks the reader for an answer waits to be dismissed.
      // Everything else is a passing remark and behaves like one.
      if (!reading.asks) {
        const timer = setTimeout(() => dismiss(event.id), HOLD_MS);
        timers.current.set(event.id, timer);
      }
    },
    [currentUser?.id, dismiss]
  );

  useEffect(() => {
    const held = timers.current;
    return () => {
      for (const timer of held.values()) clearTimeout(timer);
      held.clear();
    };
  }, []);

  const api = useMemo<TableApi>(
    () => ({ announcements, history, dismiss, dismissAll, seats, attend }),
    [announcements, history, dismiss, dismissAll, seats, attend]
  );

  return (
    <TableContext.Provider value={api}>
      {tables.map(id => (
        <TableListener
          key={id}
          campaignId={id}
          onEvent={onEvent}
          onSeat={onSeat}
        />
      ))}
      {children}
    </TableContext.Provider>
  );
}

export function useTable(): TableApi {
  const api = useContext(TableContext);
  if (!api) throw new Error('useTable must be used within a TableProvider');
  return api;
}

/**
 * Listen to a table for as long as this is mounted.
 *
 * Mounted by every page that is at one — the campaign page, the screen, a
 * player's own play surface. Renders nothing: the announcements come out at
 * the root, which is what lets them reach somebody who has wandered off to the
 * compendium mid-session.
 */
export function AtTable({ campaignId }: { campaignId: string | null }) {
  const { attend } = useTable();
  useEffect(() => {
    if (!campaignId) return;
    return attend(campaignId);
  }, [campaignId, attend]);
  return null;
}
