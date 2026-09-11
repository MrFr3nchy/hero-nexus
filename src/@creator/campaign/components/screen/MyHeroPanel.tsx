'use client';

import { Link } from '@heroui/react';
import { useEffect, useState } from 'react';

import { LoadoutSection } from '@/@creator/character/components/sections/LoadoutSection';
import { EmptyState, CandleScene } from '@/@shared/components/ui';
import type { CharacterRow } from '@/server/characters';
import type { PlayLoadout } from '@/server/play';
import { getPlayLoadoutAction } from '../../play-actions';

/**
 * The player's own hero, on the table screen.
 *
 * The screen already gave players most of what the DM sees — initiative, the
 * party's hit points, the roll log, handouts. What it never gave them was the
 * half of their own sheet that changes during a session: what is in hand and
 * what is prepared. So a player ran their character in one tab and watched the
 * table in another.
 *
 * This is the same `LoadoutSection` the play surface mounts, not a second copy
 * of it — a spell prepared here is prepared there, because it is one component
 * over one server pair.
 */
export function MyHeroPanel({
  campaignId,
  myCharacters,
  loadoutKey,
  onError,
}: {
  campaignId: string;
  myCharacters: CharacterRow[];
  /**
   * The viewer's own `PlayState.loadoutKey` off the live state, when the
   * caller has it. It moves when the pack or the purse does — a potion handed
   * over by somebody else included — and the loadout is re-read when it does.
   */
  loadoutKey?: string;
  onError: (message: string) => void;
}) {
  // At most one, by the unique index on `(campaignId, userId)` — a player
  // fields one character per table.
  const mine = myCharacters.find(c => c.table?.campaignId === campaignId);
  const [loadout, setLoadout] = useState<PlayLoadout | null>(null);

  useEffect(() => {
    if (!mine) {
      setLoadout(null);
      return;
    }
    let live = true;
    getPlayLoadoutAction(mine.id, campaignId).then(next => {
      if (live) setLoadout(next);
    });
    return () => {
      live = false;
    };
  }, [mine, campaignId, loadoutKey]);

  if (!mine) {
    return (
      <EmptyState
        scene={<CandleScene />}
        title="No hero of yours at this table"
        description="Take a seat with one of your characters and their gear will be here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-ink">{mine.name}</h3>
        <Link
          href={`/characters/${mine.id}/play`}
          className="text-sm text-ink-muted hover:text-ink"
        >
          Open the full sheet
        </Link>
      </div>
      {loadout ? (
        <LoadoutSection
          initial={loadout}
          characterId={mine.id}
          campaignId={campaignId}
          onError={onError}
          stacked
        />
      ) : (
        <p className="text-sm text-ink-subtle">Fetching what you carry…</p>
      )}
    </div>
  );
}
