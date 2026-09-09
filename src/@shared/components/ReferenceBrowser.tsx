'use client';

import { Button, Input, Link } from '@heroui/react';
import { useMemo, useState } from 'react';

import {
  contentMeta,
  isForged,
  refKey,
  type ContentType,
  type ShelfItem,
} from '@/@shared/content';

import { StatBlock } from './StatBlock';
import { EmptyState, Glyph, Marginalia, TomeScene } from './ui';

/**
 * The compendium: a searchable shelf on the left, the entry itself on the
 * right.
 *
 * Takes `ShelfItem`, so the same browser serves SRD spells, SRD classes, and
 * anyone's homebrew — and the detail pane is a real `StatBlock` rather than
 * the name-chips-paragraph it used to render. Adding a type here is nothing:
 * the chips come from `CONTENT_REGISTRY` and the body from `StatBlock`,
 * neither of which this file knows the shape of.
 *
 * It reads `origin` rather than `ref.source` wherever the question is whose
 * something is: "forged" and "yours" stop being the same thing the moment the
 * market can put someone else's homebrew on your shelf.
 */

/** What the shelf is showing. `all` is the shelf as it arrived. */
type Lens = 'all' | 'forged' | 'srd';

const LENSES: { id: Lens; label: string; title: string }[] = [
  { id: 'all', label: 'All', title: 'Everything on this shelf' },
  { id: 'forged', label: 'Homebrew', title: 'Only what has been forged' },
  { id: 'srd', label: 'SRD', title: 'Only the published rules' },
];

/** The types a hero is actually built out of — see `buildHref`. */
const BUILD_PARAM: Partial<Record<ContentType, string>> = {
  class: 'class',
  species: 'species',
  background: 'background',
};

export function ReferenceBrowser({
  type,
  items,
  emptyHint,
  createHref,
}: {
  type: ContentType;
  items: ShelfItem[];
  /** Shown when there is nothing to browse. Defaults to the SRD seed hint. */
  emptyHint?: string;
  /**
   * Where a new one of these is forged. Given it, the shelf carries its own
   * `+` and its empty state stops being a dead end — the shelf you are reading
   * is where you would want to add to it, not a hub two clicks away.
   */
  createHref?: string;
}) {
  const [query, setQuery] = useState('');
  const [lens, setLens] = useState<Lens>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(
    items[0] ? refKey(items[0].entry.ref) : null
  );

  const meta = contentMeta(type);

  const forgedCount = items.filter(isForged).length;
  /** Nothing to sort by lens when the shelf is all one kind. */
  const showLenses = forgedCount > 0 && forgedCount < items.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      if (lens === 'forged' && !isForged(item)) return false;
      if (lens === 'srd' && isForged(item)) return false;
      return !q || item.entry.name.toLowerCase().includes(q);
    });
  }, [items, query, lens]);

  const selected =
    filtered.find(i => refKey(i.entry.ref) === selectedKey) ??
    filtered[0] ??
    null;

  /**
   * "Start a hero with this", for the three picks a character is actually
   * built from. A spell or a potion is not something a build opens on, and a
   * button that lands you in the wizard having chosen nothing is a lie about
   * where it took you.
   */
  const buildHref = (item: ShelfItem): string | null => {
    const param = BUILD_PARAM[item.entry.type];
    return param
      ? `/creator/character?${param}=${encodeURIComponent(item.entry.ref.key)}`
      : null;
  };

  if (items.length === 0) {
    return (
      <EmptyState
        scene={<TomeScene />}
        title="The shelves are bare"
        description={
          emptyHint ??
          'No SRD content has been synced into this instance yet. Run `npm run db:seed` to pull it from Open5e.'
        }
        action={
          createHref ? (
            <Button as={Link} href={createHref} color="primary">
              {`Forge a ${meta.label.toLowerCase()}`}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_1fr]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            placeholder={`Search ${meta.plural.toLowerCase()}…`}
            value={query}
            onValueChange={setQuery}
            isClearable
            onClear={() => setQuery('')}
          />
          {createHref && (
            <Button
              as={Link}
              href={createHref}
              isIconOnly
              size="sm"
              variant="flat"
              aria-label={`Forge a new ${meta.label.toLowerCase()}`}
              title={`Forge a new ${meta.label.toLowerCase()}`}
              className="shrink-0 text-ink-muted data-[hover=true]:text-gold-strong"
            >
              <Glyph name="plus" size={16} />
            </Button>
          )}
        </div>

        {showLenses && (
          <div
            role="group"
            aria-label={`Filter ${meta.plural.toLowerCase()}`}
            className="flex overflow-hidden rounded-[var(--radius-card)] border border-line"
          >
            {LENSES.map(l => (
              <button
                key={l.id}
                type="button"
                title={l.title}
                aria-pressed={lens === l.id}
                onClick={() => setLens(l.id)}
                className={`flex-1 border-r border-line px-2 py-1.5 text-xs transition-colors last:border-r-0 ${
                  lens === l.id
                    ? 'bg-surface-2 font-medium text-ink'
                    : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}

        <ul className="max-h-[28rem] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface">
          {filtered.map(item => {
            const key = refKey(item.entry.ref);
            const isSelected =
              selected != null && refKey(selected.entry.ref) === key;
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
                  <span className="truncate">{item.entry.name}</span>
                  {isForged(item) && (
                    <span
                      className="shrink-0 font-display-alt text-[0.55rem] uppercase tracking-[0.12em] text-arcane"
                      title={
                        item.origin === 'mine'
                          ? 'Homebrew — yours'
                          : 'Homebrew — from the market'
                      }
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
              <Marginalia>
                {lens === 'forged'
                  ? 'nothing forged on this shelf yet'
                  : 'nothing by that name in these pages'}
              </Marginalia>
            </li>
          )}
        </ul>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        {selected ? (
          <>
            <StatBlock entry={selected.entry} />
            {(buildHref(selected) !== null || selected.origin === 'mine') && (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                {buildHref(selected) !== null && (
                  <Button
                    as={Link}
                    href={buildHref(selected) as string}
                    size="sm"
                    color="primary"
                    variant="flat"
                  >
                    Start a hero with this
                  </Button>
                )}
                {/*
                  Editing is only offered for something you forged yourself: an
                  SRD row has no editable original, and a market copy is
                  somebody else's — in both cases the button would promise a
                  change the app cannot make.
                */}
                {selected.origin === 'mine' && (
                  <>
                    <Button
                      as={Link}
                      href={`/creator/homebrew?id=${selected.entry.ref.key}`}
                      size="sm"
                      variant="flat"
                    >
                      Edit in the forge
                    </Button>
                    <Marginalia dash className="self-center">
                      yours — send it to a table from the forge
                    </Marginalia>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-subtle">Select an entry.</p>
        )}
      </div>
    </div>
  );
}
