'use client';

import { useState } from 'react';

import { Glyph, Pill } from '@/@shared/components/ui';
import type { ClockRow } from '@/server/clocks';
import type { QuestRow } from '@/server/quests';
import { ClockSegments } from '../ClocksPanel';
import { QuestCard, QUEST_STATUS } from '../QuestPanel';
import { PlaceChip } from './PlaceChip';
import type { World } from './useWorld';

/**
 * The World's rows: one line per quest or clock, the same on a place's sheet
 * and in the Everywhere ledger. A hatched, dotted row is one the party has
 * not been shown (the `hidden` state: "only you").
 */

const rowSkin = (hidden: boolean) =>
  hidden
    ? 'status-hatch border-dotted border-arcane/50'
    : 'border-line bg-surface';

/** One quest, folded to its next step; opened, the whole card. */
export function QuestLine({
  campaignId,
  quest,
  world,
  isStaff,
  here,
  muted = false,
  defaultOpen = false,
  onOpenPlace,
  onError,
  refresh,
  extra,
}: {
  campaignId: string;
  quest: QuestRow;
  world: Pick<World, 'entries' | 'byId'>;
  isStaff: boolean;
  /** The place being looked at: a step there needs no chip saying so. */
  here?: string | null;
  muted?: boolean;
  defaultOpen?: boolean;
  onOpenPlace: (placeId: string) => void;
  onError: (message: string) => void;
  refresh: () => Promise<void>;
  /** More controls at the end of the line: "Place it". */
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const next = quest.objectives.find(o => !o.done) ?? null;
  const status = QUEST_STATUS.find(s => s.key === quest.status);
  const hidden = isStaff && quest.visibility === 'dm';
  const closed = quest.status === 'done' || quest.status === 'failed';

  if (open) {
    return (
      <div className="space-y-1">
        <QuestCard
          campaignId={campaignId}
          quest={quest}
          isStaff={isStaff}
          refresh={refresh}
          onError={onError}
          mapLinks={null}
          world={{ entries: world.entries, byId: world.byId, onOpenPlace }}
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-8 items-center gap-1 text-xs text-ink-subtle hover:text-ink"
        >
          <Glyph name="chevron-up" size={12} />
          Fold it
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-[var(--radius-card)] border px-3 py-2.5 ${rowSkin(
        hidden
      )} ${muted || closed ? 'opacity-75' : ''}`}
    >
      <Glyph
        name="scroll"
        size={16}
        className={`mt-0.5 shrink-0 ${
          hidden ? 'text-ink-subtle' : 'text-gold-strong dark:text-gold'
        }`}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block max-w-full truncate text-left font-medium text-ink hover:underline"
        >
          {quest.title || 'Untitled quest'}
        </button>
        {next ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span className="min-w-0 truncate">Next: {next.body}</span>
            {next.placeId && next.placeId !== here && (
              <PlaceChip
                placeId={next.placeId}
                entries={world.entries}
                byId={world.byId}
                onOpen={onOpenPlace}
              />
            )}
          </div>
        ) : (
          quest.summary && (
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {quest.summary}
            </p>
          )
        )}
        {extra && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {extra}
          </div>
        )}
      </div>
      {hidden ? (
        <Pill tone="arcane">Only you</Pill>
      ) : (
        status && <Pill tone={status.tone}>{status.label}</Pill>
      )}
    </div>
  );
}

/** One clock, as a line: its name and its segments. */
export function ClockLine({
  clock,
  isStaff,
  muted = false,
  extra,
}: {
  clock: ClockRow;
  isStaff: boolean;
  muted?: boolean;
  extra?: React.ReactNode;
}) {
  const hidden = isStaff && clock.visibility === 'dm';
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-3 py-2 ${rowSkin(
        hidden
      )} ${muted || clock.status === 'done' ? 'opacity-80' : ''}`}
    >
      <Glyph name="hourglass" size={15} className="shrink-0 text-ink-subtle" />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {clock.title || 'A clock'}
      </span>
      {extra}
      <ClockSegments
        segments={clock.segments}
        filled={clock.filled}
        done={clock.status === 'done'}
      />
      <span className="text-xs tabular-nums text-ink-subtle">
        {clock.filled}/{clock.segments}
      </span>
    </div>
  );
}
