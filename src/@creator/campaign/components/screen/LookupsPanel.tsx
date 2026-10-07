'use client';

import { useState } from 'react';

import { Glyph, Marginalia } from '@/@shared/components/ui';
import { lookupKey, type KeptLookup } from '../../lib/lookup';
import { LookupView, lookupGlyph } from './LookupView';

/**
 * Lookups: what this reader found with Search and kept on the screen. One
 * row each, opened in place one at a time, put away with its ×. Stored with
 * the screen's layouts, so it follows them from the laptop they prep on to
 * the tablet they run the session from.
 */
export function LookupsPanel({
  campaignId,
  kept,
  isStaff,
  onRemove,
  onError,
}: {
  campaignId: string;
  kept: KeptLookup[];
  isStaff: boolean;
  onRemove: (item: KeptLookup) => void;
  onError: (message: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(
    kept[0] ? lookupKey(kept[0].ref) : null
  );

  if (kept.length === 0) {
    return (
      <div className="space-y-1 py-1">
        <p className="text-sm text-ink-muted">Nothing kept yet.</p>
        <Marginalia dash>
          search with / and keep what you will need again tonight
        </Marginalia>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {kept.map(item => {
        const key = lookupKey(item.ref);
        const open = key === openKey;
        return (
          <li key={key} className="py-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : key)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm text-ink"
              >
                <Glyph
                  name={lookupGlyph(item.ref)}
                  size={14}
                  className="shrink-0 text-ink-muted"
                />
                <span className="truncate">{item.name}</span>
                <Glyph
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={12}
                  className="ml-auto shrink-0 text-ink-subtle"
                />
              </button>
              <button
                type="button"
                aria-label={`Put ${item.name} away`}
                onClick={() => onRemove(item)}
                className="shrink-0 rounded p-1 text-ink-subtle hover:text-ink"
              >
                <Glyph name="x" size={12} />
              </button>
            </div>
            {open && (
              <div className="pb-2 pl-6 pt-1">
                <LookupView
                  campaignId={campaignId}
                  lookup={item.ref}
                  isStaff={isStaff}
                  onError={onError}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
