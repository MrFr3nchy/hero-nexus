'use client';

/**
 * "The table is sitting."
 *
 * A hairline strip across the top of the app, on every page, whenever one of
 * the reader's tables has actually sat down. It is the answer to the complaint
 * this work started from — that a session only reached whoever was already
 * looking at the panel it lived in — and it does two jobs:
 *
 * 1. **One press into the room.** From the compendium, the dashboard, their
 *    own sheet, anywhere.
 * 2. **It joins the stream.** Mounting `AtTable` here means a player reading
 *    the spell list still hears the DM start a countdown. Without this the
 *    announcement layer would only ever fire on the two pages that already
 *    knew they were at a table, which is the problem rather than the fix.
 *
 * Deliberately not a `SectionCard`, a banner image or a toast: it is chrome,
 * it holds still, and it is one line tall so it costs no page real estate on
 * the screen a DM is running a fight from.
 */
import { Link } from '@heroui/react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { mySittingAction } from '@/@creator/campaign/chronicle-actions';
import { AtTable, useTable } from '@/@shared/table';
import { Glyph } from './ui';

type Sitting = Awaited<ReturnType<typeof mySittingAction>>;

/**
 * How often to ask whether a table has sat down.
 *
 * Slow on purpose. Once the reader is attending a table the stream tells them
 * everything, so this only has to catch the transition into a session — and a
 * DM saying "take your seats" is not a thing anybody needs to learn within
 * three seconds. One cheap query a minute across every open tab is the budget
 * this is spending.
 */
const ASK_MS = 60_000;

/**
 * The last answer, kept per tab.
 *
 * The bar is chrome, and chrome that arrives a beat after the page and shoves
 * everything down by its own height reads as the page jumping. A full load
 * paints what this tab last knew before the first frame, and the real ask
 * overwrites it a moment later — wrong for at most that moment, and only when
 * the table rose between two full page loads in one tab. Every read and write
 * is wrapped: storage can be refused, and the bar must not care.
 */
const CACHE_KEY = 'hero-nexus.sitting';

function readCached(): Sitting {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Sitting) : null;
  } catch {
    return null;
  }
}

function writeCached(sitting: Sitting): void {
  try {
    if (sitting) sessionStorage.setItem(CACHE_KEY, JSON.stringify(sitting));
    else sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to do: the next load pays the one-frame shift instead.
  }
}

/** "for 1h 20m", or nothing while it is still fresh. */
function sittingFor(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const ms = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function SittingBar() {
  const [sitting, setSitting] = useState<Sitting>(null);
  const pathname = usePathname();
  const { history } = useTable();

  const ask = useCallback(async () => {
    const next = await mySittingAction();
    setSitting(next);
    writeCached(next);
  }, []);

  // Before the first frame, not after it — that is the whole point.
  useLayoutEffect(() => {
    setSitting(readCached());
  }, []);

  /*
   * The slow ask above only has to catch the table sitting down. Once it has,
   * the bar is on the stream, and the two things that change what it says —
   * a fight starting or ending, the table rising — each arrive as an event.
   * Re-asking on those is what keeps "at the sand table" from outliving the
   * fight by up to a minute.
   */
  const latest = history[0];
  useEffect(() => {
    if (!latest) return;
    const kind = latest.event.kind;
    if (kind === 'encounter' || kind === 'sitting') ask();
  }, [latest, ask]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      ask();
      timer = setInterval(ask, ASK_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ask]);

  if (!sitting) return null;

  const been = sittingFor(sitting.startedAt);
  // Offering a way into the room you are standing in reads as the bar not
  // knowing where you are. It still says the table is sitting, and how long
  // for — that is the half worth keeping on every page.
  const alreadyThere = pathname === `/campaigns/${sitting.campaignId}/screen`;
  /*
   * Which table, not only that one is sitting. A fight running is the one
   * thing worth changing the bar's tone for — the sword and the danger ink
   * are the same marks the screen's ribbon wears at the sand table — and the
   * link goes straight to the screen, which opens on the board.
   */
  const fighting = sitting.table === 'battle';

  return (
    <>
      {/* The reason this component earns its place: the reader is now on the
          table's stream from wherever they happen to be standing. */}
      <AtTable campaignId={sitting.campaignId} />

      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-sm ${
          fighting
            ? 'border-danger/40 bg-danger/10'
            : 'border-gold/40 bg-gold/10'
        }`}
      >
        <Glyph
          name={fighting ? 'sword' : 'tankard'}
          size={15}
          className={`shrink-0 ${
            fighting ? 'text-danger' : 'text-gold-strong dark:text-gold'
          }`}
        />
        <span className="text-ink">
          <span className="font-medium">{sitting.campaignName}</span>{' '}
          {fighting ? 'is at the sand table' : 'is sitting'}
        </span>
        <span className="text-ink-subtle">
          Session {sitting.number}
          {sitting.title ? ` · ${sitting.title}` : ''}
          {fighting && sitting.fightName ? ` · ${sitting.fightName}` : ''}
          {been ? ` · ${been}` : ''}
        </span>
        {!alreadyThere && (
          <Link
            href={`/campaigns/${sitting.campaignId}/screen`}
            size="sm"
            className={`ml-auto underline-offset-2 hover:underline ${
              fighting ? 'text-danger' : 'text-gold-strong dark:text-gold'
            }`}
          >
            {fighting
              ? 'To the sand table'
              : sitting.isStaff
                ? 'Behind the screen'
                : 'Take your seat'}
          </Link>
        )}
      </div>
    </>
  );
}
