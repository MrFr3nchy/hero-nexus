'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { refKey, type ContentEntry, type ContentRef } from '@/@shared/content';

import { resolveContentAction } from '../actions';
import type { CharacterSheet } from '../schema';

/**
 * Stats for the content a sheet points at.
 *
 * The sheet stores references, never copies, so anything that needs an item's
 * armour class or a spell's level has to fetch it. Refetching happens only
 * when the *set of refs* changes — not on every keystroke in an unrelated
 * field, which a naive dependency on the sheet would cause.
 *
 * A ref that no longer resolves is simply missing from `entries`. Callers
 * render that as "unavailable" rather than as zero: a deleted homebrew item
 * must not silently change a character's armour class.
 */

export type ResolveStatus = 'loading' | 'ready' | 'failed';

export interface ResolvedContent {
  /** Entries by `refKey`. Only meaningful once `status` is 'ready'. */
  entries: Map<string, ContentEntry>;
  status: ResolveStatus;
}

/** No refs to resolve: an empty answer that is genuinely the answer. */
const NOTHING_TO_FETCH: ResolvedContent = {
  entries: new Map(),
  status: 'ready',
};

/**
 * The first render, before the effect has run.
 *
 * Deliberately 'loading' rather than 'ready': an empty map that claims to be
 * the final answer is exactly the thing this hook exists to prevent, and the
 * composed sheet would take it at its word and write the unarmoured armour
 * class over a character in plate.
 */
const NOT_ASKED_YET: ResolvedContent = {
  entries: new Map(),
  status: 'loading',
};

/**
 * Whether an empty map means "nothing left to find" or "we never found out".
 *
 * This used to be a bare `Map` and a swallowed error, which made those two
 * indistinguishable: one failed request rendered every item and spell on the
 * sheet as "unavailable — it may have been deleted", and dropped a character
 * in plate and a shield from AC 19 to AC 12. A transient failure must not read
 * as the DM having deleted your gear, so the state is now explicit and every
 * consumer has to decide what to show for each of the three cases.
 */
export function useResolvedContent(
  sheet: Pick<CharacterSheet, 'inventory' | 'spellcasting'> | undefined
): ResolvedContent {
  const [state, setState] = useState<ResolvedContent>(NOT_ASKED_YET);

  const refs = useMemo<ContentRef[]>(() => {
    const out: ContentRef[] = [];
    for (const item of sheet?.inventory ?? []) {
      if (item.ref) {
        out.push({
          source: item.ref.source,
          type: item.ref.type,
          key: item.ref.key,
        });
      }
    }
    for (const spell of sheet?.spellcasting?.spells ?? []) {
      out.push({
        source: spell.ref.source,
        type: spell.ref.type,
        key: spell.ref.key,
      });
    }
    return out;
  }, [sheet?.inventory, sheet?.spellcasting?.spells]);

  // The identity of `refs` changes on every render of a watched sheet, so the
  // fetch is keyed on its *content* instead.
  const signature = refs.map(refKey).sort().join('|');
  const lastFetched = useRef<string>('');

  useEffect(() => {
    if (signature === lastFetched.current) return;
    lastFetched.current = signature;

    if (refs.length === 0) {
      setState(NOTHING_TO_FETCH);
      return;
    }

    let cancelled = false;
    setState(prev => ({ entries: prev.entries, status: 'loading' }));

    // One retry. Most failures here are a single unlucky request — the action
    // was seen to return 503 once on mount and succeed immediately after —
    // and a sheet that reports its own gear missing is expensive enough to be
    // worth asking twice before believing it.
    const attempt = (retriesLeft: number): void => {
      resolveContentAction(refs)
        .then(entries => {
          if (cancelled) return;
          setState({
            entries: new Map(entries.map(e => [refKey(e.ref), e])),
            status: 'ready',
          });
        })
        .catch(() => {
          if (cancelled) return;
          if (retriesLeft > 0) {
            setTimeout(() => {
              if (!cancelled) attempt(retriesLeft - 1);
            }, 400);
            return;
          }
          // Keep whatever was already resolved: stale stats beat blank ones.
          setState(prev => ({ entries: prev.entries, status: 'failed' }));
        });
    };
    attempt(1);

    return () => {
      cancelled = true;
    };
  }, [signature, refs]);

  return state;
}
