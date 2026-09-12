'use client';

/**
 * What is selected on the board, shared with the shelf beside it.
 *
 * The board owns the click; the attacks panel needs to know who the target is
 * and the stat block panel which foe to show. A tiny store at module scope,
 * keyed by campaign, read through `useSyncExternalStore` — the same reasoning
 * as `table/connection.ts`: a thing two components on different branches of
 * the tree both need, without threading it through everything between them.
 *
 * A selection is a list, in the order it was made: a shift-tap adds to it,
 * and the last one added is *the* selected token — the one the attacks panel
 * aims at and the stat block shows. Bulk conditions and area templates read
 * the whole list; everything that wants one token reads the last.
 */
import { useSyncExternalStore } from 'react';

const EMPTY: readonly string[] = [];
const selected = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Replace the selection with one token, or clear it. */
export function setSelectedToken(campaignId: string, tokenId: string | null) {
  setSelectedTokens(campaignId, tokenId ? [tokenId] : []);
}

/** Replace the whole selection. Duplicates collapse; order is kept. */
export function setSelectedTokens(
  campaignId: string,
  tokenIds: readonly string[]
) {
  const next = [...new Set(tokenIds)];
  const prev = selected.get(campaignId) ?? EMPTY;
  if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
    return;
  }
  selected.set(campaignId, next);
  emit();
}

/** Add a token to the selection, or take it out if it is already in. */
export function toggleSelectedToken(campaignId: string, tokenId: string) {
  const prev = selected.get(campaignId) ?? EMPTY;
  setSelectedTokens(
    campaignId,
    prev.includes(tokenId)
      ? prev.filter(id => id !== tokenId)
      : [...prev, tokenId]
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The last token selected — the target, the foe in hand — or null. */
export function useSelectedToken(campaignId: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const list = selected.get(campaignId) ?? EMPTY;
      return list.length ? list[list.length - 1] : null;
    },
    () => null
  );
}

/** Every selected token, in the order they were picked. */
export function useSelectedTokens(campaignId: string): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => selected.get(campaignId) ?? EMPTY,
    () => EMPTY
  );
}
