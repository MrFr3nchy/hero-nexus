'use client';

import { useState } from 'react';

import { DiceSpinner } from '@/@shared/components/ui';
import { useCampaignLive } from '@/@shared/hooks/useCampaignLive';
import { BattleBoard } from './BattleBoard';
import { InitiativeTracker } from './InitiativeTracker';

/**
 * The fight, and nothing else.
 *
 * The board with the initiative order under it, on one stream — the same
 * components the Session tab and the screen use, over the same `LiveState`.
 * A DM running a round does not want to scroll past the hourglass and the
 * handouts to find whose turn it is; a player on a phone does not want to at
 * all.
 */
export function BoardTab({ campaignId }: { campaignId: string }) {
  const { state, error: liveError, refresh } = useCampaignLive(campaignId);
  const [error, setError] = useState<string | null>(null);

  if (!state) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Setting the table…" />
      </div>
    );
  }

  const isStaff = state.role === 'gm' || state.role === 'co-gm';

  return (
    <div className="space-y-5">
      {(error || liveError) && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error || liveError}
        </p>
      )}

      <BattleBoard
        campaignId={campaignId}
        state={state}
        isStaff={isStaff}
        refresh={refresh}
        onError={setError}
      />

      <InitiativeTracker
        campaignId={campaignId}
        state={state}
        isStaff={isStaff}
        refresh={refresh}
        onError={setError}
      />
    </div>
  );
}
