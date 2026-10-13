'use client';

import { Select, SelectItem } from '@heroui/react';
import { useMemo } from 'react';

import { flattenPlaces, placesUnder, type WorldEntry } from '../../lib/world';

const NOWHERE = '__nowhere__';

/**
 * Pick a place: every place at the table, indented under the place it sits
 * in, so "Dock Ward" reads as Waterdeep's and not as a second Dock Ward
 * somewhere else.
 *
 * `within` is the entry being placed. When it is itself a place, it and
 * everything inside it are left off the list — a place cannot sit inside a
 * place that is inside it, and offering the choice only to refuse it would
 * be a trap.
 */
export function PlacePicker({
  entries,
  value,
  onChange,
  label = 'Where',
  within = null,
  nowhere = 'Nowhere in particular',
  size = 'sm',
  className,
}: {
  entries: readonly WorldEntry[];
  value: string | null;
  onChange: (placeId: string | null) => void;
  label?: string;
  within?: string | null;
  nowhere?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const options = useMemo(() => {
    const barred = within ? placesUnder(within, entries) : new Set<string>();
    if (within) barred.add(within);
    return flattenPlaces(entries).filter(o => !barred.has(o.place.id));
  }, [entries, within]);

  return (
    <Select
      size={size}
      label={label || undefined}
      aria-label={label || 'Where'}
      labelPlacement="outside"
      placeholder={nowhere}
      className={className}
      selectedKeys={[value ?? NOWHERE]}
      onSelectionChange={keys => {
        const key = String(Array.from(keys)[0] ?? NOWHERE);
        onChange(key === NOWHERE ? null : key);
      }}
    >
      {[
        <SelectItem key={NOWHERE} textValue={nowhere}>
          <span className="text-ink-muted">{nowhere}</span>
        </SelectItem>,
        ...options.map(({ place, depth }) => (
          <SelectItem key={place.id} textValue={place.title || 'Somewhere'}>
            <span style={{ paddingLeft: `${depth * 0.85}rem` }}>
              {depth > 0 && <span className="mr-1 text-ink-subtle">›</span>}
              {place.title || 'Somewhere'}
            </span>
          </SelectItem>
        )),
      ]}
    </Select>
  );
}
