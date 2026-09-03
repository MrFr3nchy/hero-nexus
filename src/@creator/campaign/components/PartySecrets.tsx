'use client';

import { useEffect, useState } from 'react';

import { EntryCard, Pill, SectionCard } from '@/@shared/components/ui';
import { listPartySecretsAction } from '@/@creator/character/notes-actions';

interface PartySecret {
  id: string;
  body: string;
  authorRole: 'gm' | 'player';
  characterId: string;
  characterName: string;
  updatedAt: string;
}

/**
 * Secrets that started with one character and have since been told to the
 * whole table.
 *
 * The private ones live on their character's sheet; this is only the tail of
 * that story — what everybody now knows, and who knew it first. Nothing is
 * filtered in the browser: the server only ever returns 'party' rows.
 */
export function PartySecrets({ campaignId }: { campaignId: string }) {
  const [secrets, setSecrets] = useState<PartySecret[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    listPartySecretsAction(campaignId)
      .then(rows => {
        if (live) setSecrets(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [campaignId]);

  // Nothing revealed yet is the normal state early in a campaign; an empty
  // card would just be furniture.
  if (!loaded || secrets.length === 0) return null;

  return (
    <SectionCard
      framed
      title="Out in the open"
      description="Secrets one character carried that the whole party now knows."
      bodyClassName="border-t-2 border-t-gold/50"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {secrets.map(secret => (
          <EntryCard
            key={secret.id}
            title={secret.characterName || 'A character'}
            kind={secret.authorRole === 'gm' ? '🎲 From the DM' : '🗝️ Player'}
            tone="gold"
            badges={<Pill tone="gold">Told to the party</Pill>}
            summary={secret.body}
          />
        ))}
      </div>
    </SectionCard>
  );
}
