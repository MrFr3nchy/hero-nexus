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
import { useCallback, useEffect, useState } from 'react';

import { mySittingAction } from '@/@creator/campaign/chronicle-actions';
import { AtTable } from '@/@shared/table';
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

  const ask = useCallback(async () => {
    setSitting(await mySittingAction());
  }, []);

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

  return (
    <>
      {/* The reason this component earns its place: the reader is now on the
          table's stream from wherever they happen to be standing. */}
      <AtTable campaignId={sitting.campaignId} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold/40 bg-gold/10 px-4 py-1.5 text-sm">
        <Glyph
          name="tankard"
          size={15}
          className="shrink-0 text-gold-strong dark:text-gold"
        />
        <span className="text-ink">
          <span className="font-medium">{sitting.campaignName}</span> is sitting
        </span>
        <span className="text-ink-subtle">
          Session {sitting.number}
          {sitting.title ? ` · ${sitting.title}` : ''}
          {been ? ` · ${been}` : ''}
        </span>
        <Link
          href={`/campaigns/${sitting.campaignId}/screen`}
          size="sm"
          className="ml-auto text-gold-strong underline-offset-2 hover:underline dark:text-gold"
        >
          {sitting.isStaff ? 'Behind the screen' : 'Take your seat'}
        </Link>
      </div>
    </>
  );
}
