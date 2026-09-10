'use client';

import { useState } from 'react';

import {
  contentMeta,
  type ContentType,
  type ShelfItem,
} from '@/@shared/content';

import { ReferenceBrowser } from './ReferenceBrowser';

export interface Shelf {
  type: ContentType;
  items: ShelfItem[];
  createHref: string;
  /** Shown when the shelf is empty; the SRD hint is wrong for forged-only kinds. */
  emptyHint?: string;
}

/**
 * Two shelves that are really one shelf.
 *
 * Subclasses are not a separate compendium — Open5e keeps them inside the
 * class rows, `CATEGORIES_FOR.subclass` is empty, and a nav row leading to a
 * page that is empty until you forge something is a dead end. They belong
 * beside the classes they specialise, reached by a control rather than by a
 * route.
 *
 * Deliberately not `Tabs` from HeroUI: this is the same segmented control the
 * `ReferenceBrowser` uses for its own lenses, so the two rows of controls on
 * this page read as one instrument rather than two libraries.
 */
export function ShelfTabs({ shelves }: { shelves: Shelf[] }) {
  const [active, setActive] = useState(shelves[0]?.type);
  const shelf = shelves.find(s => s.type === active) ?? shelves[0];
  if (!shelf) return null;

  return (
    <div>
      <div className="mb-4 inline-flex overflow-hidden rounded-md border border-line">
        {shelves.map(s => {
          const meta = contentMeta(s.type);
          const on = s.type === shelf.type;
          return (
            <button
              key={s.type}
              type="button"
              onClick={() => setActive(s.type)}
              aria-pressed={on}
              className={`px-3 py-1.5 font-display-alt text-[0.7rem] uppercase tracking-[0.12em] transition-colors ${
                on
                  ? 'bg-gold/15 text-gold-strong'
                  : 'bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              {meta.plural}
              <span className="ml-1.5 tabular-nums text-ink-subtle">
                {s.items.length}
              </span>
            </button>
          );
        })}
      </div>

      <ReferenceBrowser
        key={shelf.type}
        type={shelf.type}
        items={shelf.items}
        createHref={shelf.createHref}
        emptyHint={shelf.emptyHint}
      />
    </div>
  );
}
