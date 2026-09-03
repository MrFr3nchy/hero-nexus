'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  CandleScene,
  DiceSpinner,
  EmptyState,
  SectionCard,
} from '@/@shared/components/ui';
import type { PlayState } from '@/server/play';
import { listPartyPlayStateAction } from '../play-actions';
import { PlayCard } from './PlayCard';

/**
 * The party as it stands right now.
 *
 * A player's own character comes first and opens full — they are the one
 * spending the slots. Everyone else is compact, because at the table you want
 * to know whether the cleric is still up, not their passive Perception.
 */
export function PartyPlayPanel({
  campaignId,
  isStaff,
  onError,
}: {
  campaignId: string;
  isStaff: boolean;
  onError: (message: string) => void;
}) {
  const [party, setParty] = useState<PlayState[] | null>(null);

  const load = useCallback(async () => {
    try {
      setParty(await listPartyPlayStateAction(campaignId));
    } catch {
      onError('Failed to read the party.');
      setParty([]);
    }
  }, [campaignId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (next: PlayState) =>
    setParty(
      prev =>
        prev?.map(p => (p.characterId === next.characterId ? next : p)) ?? null
    );

  if (!party) {
    return (
      <div className="flex justify-center py-10">
        <DiceSpinner label="Taking the party's pulse…" />
      </div>
    );
  }

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
    >
      {mine.map(p => (
        <PlayCard
          key={p.characterId}
          state={p}
          campaignId={campaignId}
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
            compact={!isStaff}
            onChange={replace}
            onError={onError}
          />
        ))}
      </div>
    </SectionCard>
  );
}
