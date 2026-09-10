'use client';

import { Button } from '@heroui/react';

import { Glyph, Marginalia, SectionCard } from '@/@shared/components/ui';
import { useTable } from '@/@shared/table';
import type { EventTone } from '@/@shared/table';

const TONE_INK: Record<EventTone, string> = {
  gold: 'text-gold-strong dark:text-gold',
  danger: 'text-danger',
  success: 'text-success',
  arcane: 'text-arcane',
};

function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The evening's traffic, standing still.
 *
 * The same moments the corner announces, kept as a list — for a DM who wants
 * the session's noise in a box they can look down at rather than as slips that
 * pass while they are talking. One `describe` feeds both, so the panel and the
 * announcement never say different things about the same event.
 *
 * It empties when the tab closes, and that is honest: an event is a moment,
 * and the things that outlive one are rows elsewhere — the roll log, the
 * reveal timeline, the checks. This is not a second copy of any of them.
 */
export function FeedPanel({ campaignId }: { campaignId: string }) {
  const { history, announcements, dismissAll } = useTable();
  const mine = history.filter(a => a.campaignId === campaignId);

  return (
    <SectionCard
      title="The evening"
      description="Everything the table has been told, since you opened this tab."
      actions={
        announcements.length > 0 && (
          <Button
            size="sm"
            variant="light"
            className="text-ink-muted"
            onPress={dismissAll}
          >
            Clear the corner
          </Button>
        )
      }
    >
      {mine.length === 0 ? (
        <Marginalia dash>nothing has happened yet</Marginalia>
      ) : (
        <ol className="divide-y divide-line">
          {mine.map(a => (
            <li key={a.id} className="flex items-baseline gap-2.5 py-2">
              <Glyph
                name={a.reading.glyph}
                size={14}
                className={`shrink-0 translate-y-0.5 ${TONE_INK[a.reading.tone]}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink">
                  {a.reading.title}
                </p>
                {a.reading.detail && (
                  <p className="truncate text-xs text-ink-subtle">
                    {a.reading.detail}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[0.65rem] tabular-nums text-ink-subtle">
                {clock(a.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
