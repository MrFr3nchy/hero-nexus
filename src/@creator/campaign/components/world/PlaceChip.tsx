'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useState } from 'react';

import { Glyph, type GlyphName } from '@/@shared/components/ui';
import type { CanonEntryRow } from '../../lib/canon';
import { PlacePicker } from './PlacePicker';

/**
 * The mark for a kind of place, read from what the DM wrote under "What it
 * is": a tavern is a tankard, a harbour an anchor, a city a keep. Anything
 * the words do not name is a keep, which is what a place has always been.
 */
const KINDS: [RegExp, GlyphName][] = [
  [/tavern|inn\b|alehouse|taproom|pub\b/, 'tankard'],
  [/temple|chapel|shrine|church|abbey|monastery|cathedral/, 'holy-symbol'],
  [/dock|harbou?r|port\b|wharf|pier|quay/, 'anchor'],
  [/market|bazaar|shop|stall|fair\b/, 'stall'],
  [/marsh|swamp|fen\b|bog|mire/, 'marsh'],
  [/forest|wood|grove|glade/, 'tree'],
  [/mountain|hill|peak|ridge|pass\b/, 'hills'],
  [/village|hamlet|town\b|house|home|farm|district|ward\b|quarter/, 'house'],
  [/region|kingdom|realm|coast|valley|land|world|continent/, 'compass'],
];

export function placeGlyph(
  place: Pick<CanonEntryRow, 'fields'> | null
): GlyphName {
  const type = (place?.fields?.type ?? '').toLowerCase();
  return KINDS.find(([re]) => re.test(type))?.[1] ?? 'castle';
}

/**
 * Where something is, as a chip: the place's mark and name. Pressing it opens
 * the place. For staff a second control changes it, and a thing with no
 * place offers **Place it** instead — the one verb for giving something a
 * home in the World.
 */
export function PlaceChip({
  placeId,
  entries,
  byId,
  onOpen,
  onChange,
  fallback,
  label = 'Where',
}: {
  placeId: string | null;
  entries: readonly CanonEntryRow[];
  byId: ReadonlyMap<string, CanonEntryRow>;
  onOpen?: (placeId: string) => void;
  /** Staff: move it. Absent, the chip only reads. */
  onChange?: (placeId: string | null) => void | Promise<void>;
  /** What to say with no place and nothing to change it with. */
  fallback?: string;
  /** The picker's label: "Where this step happens". */
  label?: string;
}) {
  const place = placeId ? byId.get(placeId) : undefined;
  const [open, setOpen] = useState(false);

  const picker = onChange && (
    <PopoverContent className="w-72 p-3">
      <PlacePicker
        entries={entries}
        value={placeId}
        label={label}
        className="w-full"
        onChange={async next => {
          setOpen(false);
          await onChange(next);
        }}
      />
    </PopoverContent>
  );

  if (!place) {
    if (!onChange) {
      return fallback ? (
        <span className="text-xs text-ink-subtle">{fallback}</span>
      ) : null;
    }
    return (
      <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <button
            type="button"
            className="inline-flex min-h-6 items-center gap-1 rounded-full border border-dashed border-line px-2 text-xs text-ink-muted hover:border-gold hover:text-ink"
          >
            <Glyph name="compass" size={12} />
            Place it
          </button>
        </PopoverTrigger>
        {picker}
      </Popover>
    );
  }

  return (
    <span className="inline-flex min-h-6 max-w-full items-center rounded-full border border-gold/60 bg-surface text-xs text-ink">
      <button
        type="button"
        disabled={!onOpen}
        onClick={() => onOpen?.(place.id)}
        className="inline-flex min-w-0 items-center gap-1 py-0.5 pl-2 pr-1.5 enabled:hover:underline"
      >
        <Glyph
          name={placeGlyph(place)}
          size={12}
          className="shrink-0 text-gold-strong dark:text-gold"
        />
        <span className="truncate">{place.title || 'Somewhere'}</span>
      </button>
      {onChange && (
        <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
          <PopoverTrigger>
            <button
              type="button"
              aria-label={`Move it from ${place.title || 'here'}`}
              className="border-l border-gold/40 px-1.5 py-0.5 text-ink-subtle hover:text-ink"
            >
              <Glyph name="pencil" size={11} />
            </button>
          </PopoverTrigger>
          {picker}
        </Popover>
      )}
    </span>
  );
}
