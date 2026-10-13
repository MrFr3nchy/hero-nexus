'use client';

import { Button, Input, Link, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { StatBlock } from '@/@shared/components/StatBlock';
import {
  DiceSpinner,
  EmptyState,
  EntryCard,
  Glyph,
  HoardScene,
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

import {
  listMyPublicationsAction,
  listShelfAction,
  listTakenPublicationsAction,
} from '../actions';
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

/**
 * Which cards the page is showing. The library is what is listed today; the
 * other two are the reader's own, and keep withdrawn and unlisted listings
 * that have left the library — an author relists from Yours, a reader finds
 * what they took after its author withdrew it (sharing-model rule 4).
 */
type Lens = 'library' | 'yours' | 'taken';

const LENS_OPTIONS: { key: Lens; label: string }[] = [
  { key: 'library', label: 'The library' },
  { key: 'yours', label: 'Yours' },
  { key: 'taken', label: 'Taken' },
];

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

export function LibraryShelf({
  initial,
  mine: initialMine,
  taken: initialTaken,
}: {
  initial: PublicationCard[];
  mine: PublicationCard[];
  taken: PublicationCard[];
}) {
  const [cards, setCards] = useState(initial);
  const [mineCards, setMineCards] = useState(initialMine);
  const [takenCards, setTakenCards] = useState(initialTaken);
  const [lens, setLens] = useState<Lens>('library');
  const [kind, setKind] = useState<KindFilter>('all');
  const [contentType, setContentType] = useState<ContentType | ''>('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  /** One author's shelf. Set by clicking a credit, cleared by the chip. */
  const [author, setAuthor] = useState<{ id: string; name: string } | null>(
    null
  );
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
          ownerId: author?.id,
          query: query.trim() || undefined,
          sort,
        })
      );
    } finally {
      setRefreshing(false);
    }
  }, [kind, contentType, tag, author, query, sort]);

  /** After a take, copy, withdraw or delete: all three lists may have moved. */
  const refreshAll = useCallback(async () => {
    const [mine, taken] = await Promise.all([
      listMyPublicationsAction(),
      listTakenPublicationsAction(),
      refresh(),
    ]);
    setMineCards(mine);
    setTakenCards(taken);
  }, [refresh]);

  useEffect(() => {
    // The shelf arrives rendered from the server; only a changed filter needs
    // to go back for more. Typing is debounced so a five-letter search is one
    // request rather than five.
    const timer = setTimeout(refresh, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [refresh, query]);

  // The two personal lenses are filtered here rather than on the server: they
  // are one reader's handful, and the library's filters mean the same thing
  // over them.
  const shown = useMemo(() => {
    if (lens === 'library') return cards;
    const q = query.trim().toLowerCase();
    const list = (lens === 'yours' ? mineCards : takenCards).filter(
      c =>
        (kind === 'all' || c.kind === kind) &&
        (!contentType || c.contentType === contentType) &&
        (!tag || c.tags.includes(tag)) &&
        (!q ||
          c.title.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q))
    );
    return sort === 'adopted'
      ? [...list].sort((a, b) => b.adoptions - a.adoptions)
      : list;
  }, [lens, cards, mineCards, takenCards, kind, contentType, tag, query, sort]);

  const tags = useMemo(() => {
    const seen = new Map<string, number>();
    for (const card of shown) {
      for (const t of card.tags) seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);
  }, [shown]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Ledger
          items={[
            { value: cards.length, label: 'in the library' },
            { value: takenCards.length, label: 'you have taken' },
            { value: mineCards.length, label: 'yours' },
          ]}
        />
        <Marginalia dash>
          it was here yesterday, it may not be tomorrow
        </Marginalia>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            size="sm"
            className="max-w-[10rem]"
            aria-label="Whose listings"
            selectedKeys={[lens]}
            onSelectionChange={keys => {
              const picked = Array.from(keys)[0] as Lens | undefined;
              if (picked) setLens(picked);
            }}
          >
            {LENS_OPTIONS.map(option => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
          <Input
            size="sm"
            className="max-w-xs"
            placeholder="Search the library…"
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

        {author && lens === 'library' && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span>Everything left here by {author.name}.</span>
            <button
              type="button"
              onClick={() => setAuthor(null)}
              className="underline underline-offset-2 hover:text-ink"
            >
              Show the whole library
            </button>
          </div>
        )}

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

      {lens === 'library' && refreshing && cards.length === 0 ? (
        <DiceSpinner label="Reading the library…" />
      ) : lens === 'yours' && shown.length === 0 ? (
        <EmptyState
          scene={<TomeScene />}
          title="Nothing of yours is in the library"
          description="Publish a piece of homebrew, a hero or a whole campaign and it will wait here, withdrawn or not."
          action={
            <Button as={Link} href="/creator/homebrew" color="primary">
              Go to the Forge
            </Button>
          }
        />
      ) : lens === 'taken' && shown.length === 0 ? (
        <EmptyState
          scene={<HoardScene />}
          title="You have taken nothing yet"
          description="Take or copy something from the library and it stays here, even if its author withdraws it."
          action={
            <Button color="primary" onPress={() => setLens('library')}>
              Browse the library
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          scene={<TomeScene />}
          title="The library is bare"
          description="Nobody has left anything here yet. Publish something from the Forge and it will be the first thing on it."
          action={
            <Button as={Link} href="/creator/homebrew" color="primary">
              Go to the Forge
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map(card => (
            <ShelfCard
              key={card.id}
              card={card}
              onChanged={refreshAll}
              onAuthor={author => {
                setLens('library');
                setAuthor(author);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShelfCard({
  card,
  onChanged,
  onAuthor,
}: {
  card: PublicationCard;
  onChanged: () => Promise<void> | void;
  onAuthor: (author: { id: string; name: string }) => void;
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
          {card.status === 'withdrawn' ? (
            <Ribbon tone="neutral">Withdrawn</Ribbon>
          ) : (
            card.visibility === 'unlisted' && (
              <Ribbon tone="neutral">Unlisted</Ribbon>
            )
          )}
          {card.adopted === 'linked' && <Ribbon tone="arcane">Taken</Ribbon>}
          {card.adopted === 'forked' && <Ribbon tone="arcane">Copied</Ribbon>}
        </>
      }
      meta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={() => onAuthor({ id: card.ownerId, name: card.credit })}
            className="underline-offset-2 hover:text-ink hover:underline"
          >
            by {card.credit}
          </button>
          {card.contents && <span>· {card.contents}</span>}
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
      ) : card.contents ? (
        <p className="text-sm text-ink-muted">
          A whole table&rsquo;s prep: {card.contents}.
        </p>
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
