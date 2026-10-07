import 'server-only';

import { randomUUID } from 'node:crypto';

import type { RollOutcome } from '@/@creator/campaign/lib/attack';
import type { RollEvent, RollVerdict } from '@/@shared/table/events';
import { publish } from './live-hub';

/**
 * Announce an attack roll, with whether it landed, to each side of the screen
 * in the words that side may read.
 *
 * Staff always hear the verdict and the AC it was measured against. Players
 * hear the verdict only where the table shows hit and miss, and never the
 * AC — the same rule `outcomeForPlayer` keeps for the roll log. Two copies
 * to two audiences, rather than one copy the browser is trusted to trim:
 * an event's payload must be safe for whoever it reaches (events.ts).
 *
 * A roll with no verdict (no target, or no AC known) is announced once, to
 * everyone, as every roll was before.
 */
export function announceAttackRoll(
  campaignId: string,
  event: Omit<RollEvent, 'verdict'>,
  outcome: Pick<RollOutcome, 'hit' | 'critical' | 'ac' | 'targetLabel'> | null,
  showHitMiss: 'staff' | 'everyone'
): void {
  if (!outcome || outcome.hit === null || event.secret) {
    publish(campaignId, event, event.secret ? 'staff' : 'everyone');
    return;
  }
  const verdict: RollVerdict = {
    result: outcome.hit ? (outcome.critical ? 'critical' : 'hit') : 'miss',
    target: outcome.targetLabel,
    ac: outcome.ac,
  };
  publish(campaignId, { ...event, verdict }, 'staff');
  publish(
    campaignId,
    {
      ...event,
      id: randomUUID(),
      verdict:
        showHitMiss === 'everyone' ? { ...verdict, ac: null } : undefined,
    },
    'players'
  );
}
