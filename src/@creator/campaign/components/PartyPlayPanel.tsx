'use client';

import { useEffect, useState } from 'react';

import { CandleScene, EmptyState, SectionCard } from '@/@shared/components/ui';

import type { PlayState } from '@/server/play';
import type { LiveState } from '@/server/session';
import { PlayCard } from './PlayCard';
import { CallRest, RestSheet } from './session/RestPanel';
import { Provisions } from './session/Provisions';

/**
 * The party as it stands right now.
 *
 * A player's own character comes first and opens full — they are the one
 * spending the slots. Everyone else is compact, because at the table you want
 * to know whether the cleric is still up, not their passive Perception.
 *
 * The numbers come off `LiveState`, so they move as the party moves them. This
 * panel used to load once and reload only on its own presses, which meant a
 * player spending a hit die reached the DM's screen when the DM happened to
 * remount it — "the DM sees what the players are doing to their character" was
 * the one part of the brief that was simply not true.
 */
export function PartyPlayPanel({
  campaignId,
  state,
  party: live,
  entries = [],
  effects = [],
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  /** The whole live read, for the rest in progress and the clock (10). */
  state: LiveState;
  party: LiveState['party'];
  /** The fight's order and its clocks, so a card can show its own count. */
  entries?: LiveState['entries'];
  effects?: LiveState['effects'];
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  /*
   * A local copy, so a press moves the number before the round trip lands.
   * `PlayCard` hands back the state the server computed, and the next live
   * read overwrites this with the same answer — an optimistic layer over an
   * authoritative one, not a second source of truth.
   */
  const [local, setLocal] = useState<PlayState[]>(live);
  useEffect(() => setLocal(live), [live]);
  const party = local;

  const replace = (next: PlayState) =>
    setLocal(prev =>
      prev.map(p => (p.characterId === next.characterId ? next : p))
    );

  const clocksFor = (characterId: string) => {
    const entry = entries.find(e => e.characterId === characterId);
    return entry ? effects.filter(x => x.entryId === entry.id) : [];
  };

  if (party.length === 0) {
    return (
      <SectionCard title="The party">
        <EmptyState
          scene={<CandleScene />}
          title="Nobody has brought a character yet"
          description={
            isStaff
              ? 'Players link a character from the Party tab, and it appears here.'
              : 'Link your character from the Party tab and it appears here.'
          }
        />
      </SectionCard>
    );
  }

  // Yours first — you are the one pressing the buttons.
  const mine = party.filter(p => p.canEdit && !isStaff);
  const rest = party.filter(p => !mine.includes(p));

  return (
    <SectionCard
      title="The party"
      description="Hit points, hit dice, slots — the numbers that move mid-fight."
      bodyClassName="space-y-3"
      actions={
        isStaff &&
        !state.rest && (
          // "You take a long rest" is one sentence at the table; here it is
          // one press that asks each player for their hit dice, then a
          // confirm (10). The sheet it opens is drawn below.
          <CallRest
            campaignId={campaignId}
            rules={state.rules}
            refresh={refresh}
            onError={onError}
          />
        )
      }
    >
      {state.rest && (
        <RestSheet
          campaignId={campaignId}
          state={state}
          isStaff={isStaff}
          refresh={refresh}
          onError={onError}
        />
      )}
      {isStaff && (
        <Provisions
          campaignId={campaignId}
          state={state}
          refresh={refresh}
          onError={onError}
        />
      )}
      {mine.map(p => (
        <PlayCard
          key={p.characterId}
          state={p}
          campaignId={campaignId}
          canRollSecret={isStaff}
          physicalDice={p.physicalDice}
          clocks={clocksFor(p.characterId)}
          restOpen={state.rest?.kind ?? null}
          onRest={refresh}
          onChange={replace}
          onError={onError}
        />
      ))}
      {/* Two across when the panel is wide enough for two cards, whatever
          the window is: on the screen this panel is a third of it. */}
      <div className="@container">
        <div className="grid gap-3 @xl:grid-cols-2">
          {rest.map(p => (
            <PlayCard
              key={p.characterId}
              state={p}
              campaignId={campaignId}
              canRollSecret={isStaff}
              physicalDice={p.physicalDice}
              clocks={clocksFor(p.characterId)}
              compact={!isStaff}
              restOpen={state.rest?.kind ?? null}
              canInspire={isStaff}
              onRest={refresh}
              onChange={replace}
              onError={onError}
            />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
