'use client';

import { useEffect, useState } from 'react';

import { CandleScene, EmptyState, SectionCard } from '@/@shared/components/ui';
import { Button } from '@heroui/react';

import type { PlayState } from '@/server/play';
import type { LiveState } from '@/server/session';
import { restPartyAction } from '../play-actions';
import { PlayCard } from './PlayCard';

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
  party: live,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  party: LiveState['party'];
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

  const callRest = async (kind: 'short' | 'long') => {
    const res = await restPartyAction(campaignId, kind);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    await refresh();
  };

  const replace = (next: PlayState) =>
    setLocal(prev =>
      prev.map(p => (p.characterId === next.characterId ? next : p))
    );

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
        isStaff && (
          <>
            {/* "You take a long rest" is one sentence at the table and was
                five separate presses here, with the fifth forgotten. */}
            <Button size="sm" variant="flat" onPress={() => callRest('short')}>
              Short rest
            </Button>
            <Button size="sm" variant="flat" onPress={() => callRest('long')}>
              Long rest
            </Button>
          </>
        )
      }
    >
      {mine.map(p => (
        <PlayCard
          key={p.characterId}
          state={p}
          campaignId={campaignId}
          canRollSecret={isStaff}
          onChange={replace}
          onError={onError}
        />
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        {rest.map(p => (
          <PlayCard
            key={p.characterId}
            state={p}
            campaignId={campaignId}
            canRollSecret={isStaff}
            compact={!isStaff}
            onChange={replace}
            onError={onError}
          />
        ))}
      </div>
    </SectionCard>
  );
}
