'use client';

/**
 * An area lit on the board, and who is inside it.
 *
 * The board's area tool (improvements 07) lights the tiles and works out
 * which combatants stand in them; the Cast panel on the shelf takes those as
 * the spell's targets. The two live on different branches of the screen, so
 * the answer passes through a store the way the selection and a placement
 * do — one per campaign, replaced by the next drag, cleared by Escape.
 */
import { useSyncExternalStore } from 'react';

import type { Area } from '@/@creator/campaign/lib/battlemap';

export interface LitArea {
  area: Area;
  /** Combatants with a token touching a lit tile, in board order. */
  entryIds: string[];
  labels: string[];
  /** The lit tile indices — what a thing's change is authored over (08). */
  tiles: number[];
}

const lit = new Map<string, LitArea | null>();
const listeners = new Set<() => void>();

export function setLitArea(campaignId: string, area: LitArea | null) {
  lit.set(campaignId, area);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLitArea(campaignId: string): LitArea | null {
  return useSyncExternalStore(
    subscribe,
    () => lit.get(campaignId) ?? null,
    () => null
  );
}
