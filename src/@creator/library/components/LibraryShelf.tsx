'use client';

import { Button, Input, Link, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { StatBlock } from '@/@shared/components/StatBlock';
import {
  DiceSpinner,
  EmptyState,
  EntryCard,
  Glyph,
  Ledger,
  Marginalia,
  Pill,
  Ribbon,
  SheetPreview,
  TomeScene,
} from '@/@shared/components/ui';
import {
  contentMeta,
  CONTENT_TYPE_ORDER,
  type ContentType,
} from '@/@shared/content';

import { listShelfAction } from '../actions';
import {
  publicationKindMeta,
  PUBLICATION_KIND_ORDER,
  type PublicationCard,
  type PublicationKind,
} from '../lib/publication';
import { AdoptControls } from './AdoptControls';

/**
 * The Wandering Library.
 *
 * Collection archetype: the shelf is the page. Every card carries the real
 * `StatBlock` behind its fold rather than a paragraph describing one, because a
 * shelf of listings that only says what is on it is the exact failure design
 * rule 1 names.
 *
 * Two verbs, and the difference between them is the whole feature. **Take it**
 * links the author's live row onto your shelf, so their corrections keep
 * reaching you and it is not yours to edit. **Copy it** forks it into your
 * forge, yours to change, and the two never speak again.
 */

type KindFilter = PublicationKind | 'all';

const KIND_OPTIONS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  ...PUBLICATION_KIND_ORDER.map(k => ({
    key: k as KindFilter,
    label: publicationKindMeta(k).plural,
  })),
];

/** `any` rather than `''`: an empty string is not a selectable key. */
const TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: 'any', label: 'Any type' },
  ...CONTENT_TYPE_ORDER.map(t => ({ key: t, label: contentMeta(t).plural })),
];

export function LibraryShelf({ initial }: { initial: PublicationCard[] }) {
  const [cards, setCards] = useState(initial);
  const [kind, setKind] = useState<KindFilter>('all');
  const [contentType, setContentType] = useState<ContentType | ''>('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<'newest' | 'adopted'>('newest');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setCards(
        await listShelfAction({
          kind: kind === 'all' ? undefined : kind,
          contentType: contentType || undefined,
          tag: tag ?? undefined,
          query: query.trim() || undefined,
          sort,
        })
      );
    } finally {
      setRefreshing(false);
    }
  }, [kind, contentType, tag, query, sort]);

  useEffect(() => {
    // The shelf arrives rendered from the server; only a changed filter needs
    // to go back for more. Typing is debounced so a five-letter search is one
    // request rather than five.
    const timer = setTimeout(refresh, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [refresh, query]);

  const taken = cards.filter(c => c.adopted !== null).length;
  const mine = cards.filter(c => c.mine).length;

  const tags = useMemo(() => {
    const seen = new Map<string, number>();
    for (const card of cards) {
      for (const t of card.tags) seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);
  }, [cards]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Ledger
          items={[
            { value: cards.length, label: 'on the shelf' },
            { value: taken, label: 'you have taken' },
            { value: mine, label: 'yours' },
          ]}
        />
        <Marginalia dash>
          it was here yesterday, it may not be tomorrow
        </Marginalia>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            size="sm"
            className="max-w-xs"
            placeholder="Search the shelf…"
            value={query}
            onValueChange={setQuery}
            startContent={
              <Glyph name="magnifier" size={14} className="text-ink-subtle" />
            }
          />
          {/* One `.map` per Select, over a plain array: HeroUI builds its
              collection from the children it is handed, and mixing a literal
              option in beside a mapped list is how one of them stops being
              selectable. */}
          <Select
            size="sm"
            className="max-w-[11rem]"
            aria-label="Kind of thing"
            selectedKeys={[kind]}
            onSelectionChange={keys =>
              setKind((Array.from(keys)[0] as KindFilter) ?? 'all')
            }
          >
            {KIND_OPTIONS.map(option => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
          <Select
            size="sm"
            className="max-w-[11rem]"
            aria-label="Content type"
            selectedKeys={[contentType || 'any']}
            onSelectionChange={keys => {
              const picked = String(Array.from(keys)[0] ?? 'any');
              setContentType(picked === 'any' ? '' : (picked as ContentType));
            }}
          >
            {TYPE_OPTIONS.map(option => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
          <Button
            size="sm"
            variant="light"
            onPress={() =>
              setSort(s => (s === 'newest' ? 'adopted' : 'newest'))
            }
          >
            {sort === 'newest' ? 'Newest first' : 'Most taken first'}
          </Button>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
            {tags.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(tag === t ? null : t)}
                className={`rounded-sm border px-1.5 py-0.5 uppercase tracking-[0.1em] ${
                  tag === t
                    ? 'border-gold/60 text-gold-strong'
                    : 'border-line hover:text-ink'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {refreshing && cards.length === 0 ? (
        <DiceSpinner label="Reading the shelf…" />
      ) : cards.length === 0 ? (
        <EmptyState
          scene={<TomeScene />}
          title="The shelf is bare"
          description="Nobody has left anything here yet. Publish something from the Forge and it will be the first thing on it."
          action={
            <Button as={Link} href="/creator/homebrew" color="primary">
              Go to the Forge
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {cards.map(card => (
            <ShelfCard key={card.id} card={card} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShelfCard({
  card,
  onChanged,
}: {
  card: PublicationCard;
  onChanged: () => Promise<void> | void;
}) {
  const kindMeta = publicationKindMeta(card.kind);
  const typeMeta = card.contentType ? contentMeta(card.contentType) : null;

  return (
    <EntryCard
      title={card.title}
      imageUrl={card.coverUrl}
      imageAlt={card.title}
      kind={
        <span className="inline-flex items-center gap-1.5">
          <Glyph name={kindMeta.glyph} size={12} />
          {typeMeta ? typeMeta.label : kindMeta.label}
        </span>
      }
      tone={card.adopted ? 'arcane' : 'default'}
      badges={
        <>
          {card.mine && <Ribbon tone="gold">Yours</Ribbon>}
          {card.adopted === 'linked' && <Ribbon tone="arcane">Taken</Ribbon>}
          {card.adopted === 'forked' && <Ribbon tone="arcane">Copied</Ribbon>}
        </>
      }
      meta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>by {card.credit}</span>
          {card.adoptions > 0 && (
            <span>
              · on {card.adoptions} other{' '}
              {card.adoptions === 1 ? 'shelf' : 'shelves'}
            </span>
          )}
          {card.tags.map(t => (
            <Pill key={t}>{t}</Pill>
          ))}
        </span>
      }
      summary={card.summary || undefined}
      openLabel="Read it"
    >
      {card.preview ? (
        <StatBlock entry={card.preview} />
      ) : card.hero ? (
        <SheetPreview
          name={card.hero.name}
          meta={card.hero.meta}
          abilities={card.hero.abilities}
          derived={card.hero.derived}
        />
      ) : card.coverUrl ? (
        // A picture listing has no stat block; the picture is the whole of it.
        // Not next/image: the file is served by our own route, and the optimiser
        // would fetch and re-encode a copy of every map on the shelf.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.coverUrl}
          alt={card.title}
          className="w-full rounded-md border border-line"
        />
      ) : (
        <p className="text-sm text-ink-subtle">
          Whatever this listing pointed at is no longer readable.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <AdoptControls card={card} onDone={() => void onChanged()} />
        <Button
          as={Link}
          href={`/library/${card.id}`}
          size="sm"
          variant="light"
        >
          Open
        </Button>
      </div>
    </EntryCard>
  );
}
