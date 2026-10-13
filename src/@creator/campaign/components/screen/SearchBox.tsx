'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDiceTray } from '@/@shared/components/dice';
import { Glyph, type GlyphName } from '@/@shared/components/ui';
import { parseNotation } from '@/@shared/lib/dice';
import type { SearchHit } from '@/server/search';
import { rollAction } from '../../actions';
import { CANON_KIND_GLYPHS } from '../../lib/canon';
import {
  BOOK_GLYPH,
  BOOK_WHERE,
  isBookType,
  lookupKey,
  matchBooks,
  matchConditions,
  matchRules,
  RECORD_GLYPH,
  type BookHit,
  type KeptLookup,
  type LookupRef,
} from '../../lib/lookup';
import { getBookIndexAction } from '../../lookup-actions';
import { searchCampaignAction } from '../../search-actions';
import { typingTarget } from './useDmShortcuts';
import { lookupGlyph } from './LookupView';

/** One row of the list, whatever it came from. */
interface Row {
  id: string;
  group: 'recent' | 'campaign' | 'books' | 'dice';
  name: string;
  where: string;
  line: string;
  glyph: GlyphName;
  homebrew?: boolean;
  /** Absent on the dice row, which rolls rather than opens. */
  item?: KeptLookup;
}

const GROUP_TITLE: Record<Row['group'], string> = {
  recent: 'Looked at tonight',
  campaign: 'This campaign',
  books: 'The books',
  dice: 'Dice',
};

/* --- recent, per device -------------------------------------------------- */

const RECENT_LIMIT = 5;
const recentKey = (campaignId: string) =>
  `hero-nexus.search-recent.${campaignId}`;

function readRecent(campaignId: string): KeptLookup[] {
  try {
    const raw = JSON.parse(localStorage.getItem(recentKey(campaignId)) ?? '[]');
    return Array.isArray(raw)
      ? (raw as KeptLookup[]).slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function writeRecent(campaignId: string, item: KeptLookup): KeptLookup[] {
  const key = lookupKey(item.ref);
  const next = [
    item,
    ...readRecent(campaignId).filter(r => lookupKey(r.ref) !== key),
  ].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(recentKey(campaignId), JSON.stringify(next));
  } catch {
    // Storage refused: the list is a convenience and forgets quietly.
  }
  return next;
}

/* --- the box ------------------------------------------------------------- */

const bookRef = (h: BookHit): LookupRef => ({ kind: 'book', ref: h.ref });

/**
 * Search, in the session screen's bar: the campaign's record and the books,
 * in one box, so nobody leaves the screen to answer "what does Hold Person
 * do" or "what was the ferryman called".
 *
 * The books are filtered here, as you type, from an index fetched once on
 * first focus — a keystroke never reads the SRD. The record is searched on
 * the server, debounced, because only the server knows what this reader may
 * read (`searchCampaign`). A hit opens beside the panels, never over them;
 * the table keeps running underneath.
 *
 * `/` focuses it from anywhere on the screen that is not taking typing.
 */
export function SearchBox({
  campaignId,
  onOpen,
  className = '',
  autoFocus = false,
  onClose,
}: {
  campaignId: string;
  onOpen: (item: KeptLookup) => void;
  className?: string;
  autoFocus?: boolean;
  /** Called on Escape and after a hit is opened (the phone's full-width box). */
  onClose?: () => void;
}) {
  const tray = useDiceTray();
  const input = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [books, setBooks] = useState<BookHit[] | null>(null);
  const [record, setRecord] = useState<{ q: string; hits: SearchHit[] }>({
    q: '',
    hits: [],
  });
  const [recent, setRecent] = useState<KeptLookup[]>([]);
  const q = query.trim();

  // `/` from anywhere not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (typingTarget(e)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const loadBooks = useCallback(() => {
    if (books !== null) return;
    setBooks([]);
    getBookIndexAction(campaignId)
      .then(setBooks)
      .catch(() => setBooks([]));
  }, [books, campaignId]);

  // The record, debounced: a server read per pause, not per key.
  useEffect(() => {
    if (q.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      searchCampaignAction(campaignId, q)
        .then(hits => live && setRecord({ q, hits }))
        .catch(() => live && setRecord({ q, hits: [] }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [campaignId, q]);

  const rows: Row[] = useMemo(() => {
    if (q.length < 2) {
      return recent.map(r => ({
        id: `recent:${lookupKey(r.ref)}`,
        group: 'recent' as const,
        name: r.name,
        where: '',
        line: '',
        glyph: lookupGlyph(r.ref),
        item: r,
      }));
    }
    const out: Row[] = [];
    const fresh = record.q === q ? record.hits : [];
    for (const h of fresh.slice(0, 6)) {
      out.push({
        id: `record:${h.kind}:${h.id}`,
        group: 'campaign',
        name: h.title,
        where: h.where,
        line: h.excerpt,
        glyph:
          h.kind === 'canon' && h.canonKind
            ? CANON_KIND_GLYPHS[h.canonKind]
            : RECORD_GLYPH[h.kind],
        item: {
          ref: { kind: 'record', record: h.kind, id: h.id },
          name: h.title,
        },
      });
    }
    for (const c of matchConditions(q)) {
      out.push({
        id: `condition:${c.key}`,
        group: 'books',
        name: c.label,
        where: 'Conditions',
        line: c.hint,
        glyph: 'question',
        item: { ref: { kind: 'condition', key: c.key }, name: c.label },
      });
    }
    for (const b of matchBooks(books ?? [], q)) {
      out.push({
        id: lookupKey(bookRef(b)),
        group: 'books',
        name: b.name,
        where: isBookType(b.ref.type) ? BOOK_WHERE[b.ref.type] : '',
        line: b.line,
        glyph: isBookType(b.ref.type) ? BOOK_GLYPH[b.ref.type] : 'tome',
        homebrew: b.homebrew,
        item: { ref: bookRef(b), name: b.name },
      });
    }
    for (const r of matchRules(q)) {
      out.push({
        id: `rule:${r.section}:${r.entry.key}`,
        group: 'books',
        name: r.entry.title,
        where: 'Rules',
        line: r.sectionTitle,
        glyph: 'gavel',
        item: {
          ref: { kind: 'rule', section: r.section, key: r.entry.key },
          name: r.entry.title,
        },
      });
    }
    // Typed something that is dice? Offer to roll it, last, never first.
    if (parseNotation(q)) {
      out.push({
        id: 'dice',
        group: 'dice',
        name: `Roll ${q}`,
        where: '',
        line: 'Into Dice, for the table to see',
        glyph: 'die',
      });
    }
    return out;
  }, [q, recent, record, books]);

  const waiting = q.length >= 2 && record.q !== q;
  const index = Math.min(active, Math.max(0, rows.length - 1));

  const close = () => {
    setOpen(false);
    setActive(0);
    input.current?.blur();
    onClose?.();
  };

  const choose = async (row: Row) => {
    if (row.group === 'dice') {
      const res = await rollAction(campaignId, {
        notation: q,
        label: '',
        characterId: null,
      });
      if (res.ok) void tray.showNotationRoll(res.data, { title: q });
      close();
      return;
    }
    if (!row.item) return;
    setRecent(writeRecent(campaignId, row.item));
    onOpen(row.item);
    setQuery('');
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && rows[index]) {
      e.preventDefault();
      void choose(rows[index]);
    }
  };

  const listId = `search-${campaignId}`;
  const groups = (['recent', 'campaign', 'books', 'dice'] as const).filter(g =>
    rows.some(r => r.group === g)
  );

  return (
    <div className={`relative min-w-0 ${className}`}>
      <label
        className={`flex h-8 items-center gap-2 rounded-lg border px-2.5 transition-colors ${
          open ? 'border-gold bg-surface' : 'border-line bg-surface-2'
        }`}
      >
        <Glyph
          name="magnifier"
          size={15}
          className="shrink-0 text-ink-subtle"
        />
        <input
          ref={input}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={rows[index] ? `${listId}-${index}` : undefined}
          aria-label="Search the record and the books"
          placeholder="Search the record and the books"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setRecent(readRecent(campaignId));
            loadBooks();
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <kbd className="hidden shrink-0 rounded border border-line bg-surface px-1.5 font-mono text-[0.7rem] text-ink-subtle sm:inline">
          /
        </kbd>
      </label>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="What Search found"
          // Keep focus in the input while a row is pressed.
          onMouseDown={e => e.preventDefault()}
          className="absolute inset-x-0 top-10 z-40 max-h-[70vh] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-1.5 [box-shadow:var(--shadow-card)]"
        >
          {q.length < 2 && rows.length === 0 && (
            <p className="px-2 py-2 text-xs text-ink-muted">
              People, places, quests, sessions, handouts and loot in this
              campaign — and spells, the bestiary, items, conditions, rules and
              house rules.
            </p>
          )}
          {q.length >= 2 && rows.length === 0 && (
            <p className="px-2 py-3 text-sm text-ink-muted">
              {waiting || books === null
                ? 'Looking…'
                : 'Nothing by that name in the record or the books.'}
            </p>
          )}
          {groups.map(g => (
            <div key={g}>
              <p className="px-2 pb-1 pt-2 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                {GROUP_TITLE[g]}
              </p>
              {rows.map((row, i) =>
                row.group !== g ? null : (
                  <div
                    key={row.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === index}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => void choose(row)}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 ${
                      i === index ? 'bg-surface-2' : ''
                    }`}
                  >
                    <Glyph
                      name={row.glyph}
                      size={15}
                      className={`mt-0.5 shrink-0 ${
                        row.group === 'campaign'
                          ? 'text-gold-strong dark:text-gold'
                          : 'text-ink-muted'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-sm text-ink">
                          {row.name}
                        </span>
                        {row.homebrew && (
                          <span className="shrink-0 rounded border border-arcane px-1 text-[0.65rem] text-arcane">
                            Homebrew
                          </span>
                        )}
                        {row.where && (
                          <span className="shrink-0 text-[0.7rem] text-ink-subtle">
                            {row.where}
                          </span>
                        )}
                      </span>
                      {row.line && (
                        <span className="block truncate text-xs text-ink-muted">
                          {row.line}
                        </span>
                      )}
                    </span>
                  </div>
                )
              )}
            </div>
          ))}
          <p className="mt-1 hidden gap-3 border-t border-line px-2 pb-0.5 pt-1.5 text-[0.7rem] text-ink-subtle sm:flex">
            <span>↑ ↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </p>
        </div>
      )}
    </div>
  );
}
