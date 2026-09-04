'use client';

import { Chip, Input } from '@heroui/react';
import { useMemo, useState } from 'react';

import { EmptyState, Marginalia, TomeScene } from './ui';

export interface RefEntry {
  slug: string;
  name: string;
  data: Record<string, unknown>;
}

function str(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'name' in v)
    return String((v as { name: unknown }).name);
  return v == null ? '' : String(v);
}

function metaChips(variant: 'class' | 'spell', d: Record<string, unknown>) {
  if (variant === 'spell') {
    return [
      d.level === 0 ? 'Cantrip' : `Level ${str(d.level)}`,
      str(d.school),
      str(d.casting_time),
      d.concentration ? 'Concentration' : null,
      d.ritual ? 'Ritual' : null,
    ].filter(Boolean) as string[];
  }
  return [
    d.hit_dice ? `Hit die d${str(d.hit_dice)}` : null,
    d.caster_type ? `${str(d.caster_type)} caster` : null,
    Array.isArray(d.saving_throws)
      ? `Saves: ${(d.saving_throws as unknown[]).map(str).join(', ')}`
      : null,
  ].filter(Boolean) as string[];
}

export function ReferenceBrowser({
  variant,
  entries,
}: {
  variant: 'class' | 'spell';
  entries: RefEntry[];
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RefEntry | null>(entries[0] ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => e.name.toLowerCase().includes(q));
  }, [entries, query]);

  if (entries.length === 0) {
    return (
      <EmptyState
        scene={<TomeScene />}
        title="The shelves are bare"
        description="No SRD content has been synced into this instance yet. Run `npm run db:seed` to pull it from Open5e."
      />
    );
  }

  const detail = selected?.data ?? {};

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_1fr]">
      <div className="flex flex-col gap-3">
        <Input
          size="sm"
          placeholder={`Search ${variant === 'spell' ? 'spells' : 'classes'}…`}
          value={query}
          onValueChange={setQuery}
          isClearable
          onClear={() => setQuery('')}
        />
        <ul className="max-h-[28rem] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface">
          {filtered.map(e => (
            <li key={e.slug}>
              <button
                type="button"
                onClick={() => setSelected(e)}
                className={`w-full border-b border-line px-3 py-2 text-left text-sm last:border-0 ${
                  selected?.slug === e.slug
                    ? 'bg-surface-2 font-medium text-ink'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {e.name}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-center">
              <Marginalia>nothing by that name in these pages</Marginalia>
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        {selected ? (
          <>
            <h2 className="font-display text-xl text-ink">{selected.name}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {metaChips(variant, detail).map(c => (
                <Chip key={c} size="sm" variant="flat" className="bg-surface-2">
                  {c}
                </Chip>
              ))}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
              {str(detail.desc).trim() ||
                'No description in the SRD data. See your rulebook for the full entry.'}
            </p>
            {variant === 'spell' && str(detail.higher_level).trim() && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                <span className="font-medium text-ink">At higher levels. </span>
                {str(detail.higher_level).trim()}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-subtle">Select an entry.</p>
        )}
      </div>
    </div>
  );
}
