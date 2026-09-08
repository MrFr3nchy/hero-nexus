'use client';

import { Input } from '@heroui/react';
import { useMemo, useState } from 'react';

import {
  contentMeta,
  refKey,
  type ContentEntry,
  type ContentType,
} from '@/@shared/content';

import { StatBlock } from './StatBlock';
import { EmptyState, Marginalia, TomeScene } from './ui';

/**
 * The compendium: a searchable shelf on the left, the entry itself on the
 * right.
 *
 * Takes `ContentEntry`, so the same browser serves SRD spells, SRD classes,
 * and anyone's homebrew — and the detail pane is a real `StatBlock` rather
 * than the name-chips-paragraph it used to render. Adding a type here is
 * nothing: the chips come from `CONTENT_REGISTRY` and the body from
 * `StatBlock`, neither of which this file knows the shape of.
 */
export function ReferenceBrowser({
  type,
  entries,
  emptyHint,
}: {
  type: ContentType;
  entries: ContentEntry[];
  /** Shown when there is nothing to browse. Defaults to the SRD seed hint. */
  emptyHint?: string;
}) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(
    entries[0] ? refKey(entries[0].ref) : null
  );

  const meta = contentMeta(type);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => e.name.toLowerCase().includes(q));
  }, [entries, query]);

  const selected =
    entries.find(e => refKey(e.ref) === selectedKey) ?? filtered[0] ?? null;

  if (entries.length === 0) {
    return (
      <EmptyState
        scene={<TomeScene />}
        title="The shelves are bare"
        description={
          emptyHint ??
          'No SRD content has been synced into this instance yet. Run `npm run db:seed` to pull it from Open5e.'
        }
      />
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_1fr]">
      <div className="flex flex-col gap-3">
        <Input
          size="sm"
          placeholder={`Search ${meta.plural.toLowerCase()}…`}
          value={query}
          onValueChange={setQuery}
          isClearable
          onClear={() => setQuery('')}
        />
        <ul className="max-h-[28rem] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface">
          {filtered.map(e => {
            const key = refKey(e.ref);
            const isSelected = selected != null && refKey(selected.ref) === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 ${
                    isSelected
                      ? 'bg-surface-2 font-medium text-ink'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <span className="truncate">{e.name}</span>
                  {e.ref.source === 'homebrew' && (
                    <span
                      className="shrink-0 font-display-alt text-[0.55rem] uppercase tracking-[0.12em] text-arcane"
                      title="Homebrew"
                    >
                      HB
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-center">
              <Marginalia>nothing by that name in these pages</Marginalia>
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        {selected ? (
          <StatBlock entry={selected} />
        ) : (
          <p className="text-sm text-ink-subtle">Select an entry.</p>
        )}
      </div>
    </div>
  );
}
