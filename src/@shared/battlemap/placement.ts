'use client';

/**
 * A combatant waiting to be put on the board.
 *
 * The initiative panel offers "Place" on any combatant with no token; the
 * board takes the next tap as where they stand. The two live on different
 * branches of the screen, so the request passes through a store the way the
 * selection does — one per campaign, cleared by the tap that fulfils it, by
 * Escape, or by the panel offering somebody else.
 */
import { useSyncExternalStore } from 'react';

export interface Placement {
  entryId: string;
  /** For the board's status line: "Tap where Goblin 3 stands". */
  label: string;
}

const pending = new Map<string, Placement | null>();
const listeners = new Set<() => void>();

export function setPlacement(campaignId: string, placement: Placement | null) {
  const prev = pending.get(campaignId) ?? null;
  if (prev?.entryId === placement?.entryId) return;
  pending.set(campaignId, placement);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePlacement(campaignId: string): Placement | null {
  return useSyncExternalStore(
    subscribe,
    () => pending.get(campaignId) ?? null,
    () => null
  );
}
