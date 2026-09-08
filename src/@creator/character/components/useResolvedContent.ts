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
 * A ref that no longer resolves is simply missing from the map. Callers render
 * that as "unavailable" rather than as zero: a deleted homebrew item must not
 * silently change a character's armour class.
 */
export function useResolvedContent(
  sheet: Pick<CharacterSheet, 'inventory' | 'spellcasting'> | undefined
): Map<string, ContentEntry> {
  const [resolved, setResolved] = useState<Map<string, ContentEntry>>(
    () => new Map()
  );

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
      setResolved(new Map());
      return;
    }

    let cancelled = false;
    resolveContentAction(refs)
      .then(entries => {
        if (cancelled) return;
        setResolved(new Map(entries.map(e => [refKey(e.ref), e])));
      })
      .catch(() => {
        // Leave the previous map in place: showing stale stats beats blanking
        // a sheet because one request failed.
      });
    return () => {
      cancelled = true;
    };
  }, [signature, refs]);

  return resolved;
}
