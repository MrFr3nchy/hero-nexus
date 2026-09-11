'use client';

/**
 * What is selected on the board, shared with the shelf beside it.
 *
 * The board owns the click; the attacks panel needs to know who the target is
 * and the stat block panel which foe to show. A tiny store at module scope,
 * keyed by campaign, read through `useSyncExternalStore` — the same reasoning
 * as `table/connection.ts`: a thing two components on different branches of
 * the tree both need, without threading it through everything between them.
 */
import { useSyncExternalStore } from 'react';

const selected = new Map<string, string | null>();
const listeners = new Set<() => void>();

export function setSelectedToken(campaignId: string, tokenId: string | null) {
  if (selected.get(campaignId) === tokenId) return;
  selected.set(campaignId, tokenId);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSelectedToken(campaignId: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => selected.get(campaignId) ?? null,
    () => null
  );
}
