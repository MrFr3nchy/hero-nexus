'use client';

import { Button, Link } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { StatBlock } from '@/@shared/components/StatBlock';
import {
  Glyph,
  Marginalia,
  Pill,
  Ribbon,
  SectionCard,
  SheetPreview,
  useConfirm,
} from '@/@shared/components/ui';
import { contentMeta } from '@/@shared/content';
import type { PublicationDetail as Detail } from '@/server/library';

import {
  deletePublicationAction,
  setPublicationStatusAction,
} from '../actions';
import { publicationKindMeta } from '../lib/publication';
import { AdoptControls } from './AdoptControls';

/**
 * One listing, full-bleed.
 *
 * Single-object archetype: the thing itself first, its metadata second. The
 * body is the real `StatBlock` (content-model rule 5) — the same renderer the
 * compendium, the Forge preview and the DM's approval queue use, so what a
 * reader is deciding about is exactly what they will get.
 */
export function PublicationDetail({ detail }: { detail: Detail }) {
  const router = useRouter();
  const { card, entry, fromSnapshot } = detail;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const kindMeta = publicationKindMeta(card.kind);
  const typeMeta = card.contentType ? contentMeta(card.contentType) : null;

  const run = async (
    action: () => Promise<{ ok: boolean; error?: string }>,
    after?: () => void
  ) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That did not work.');
      return;
    }
    if (after) after();
    else router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex flex-col gap-4">
        {entry ? (
          <SectionCard framed>
            <StatBlock entry={entry} />
          </SectionCard>
        ) : card.hero ? (
          <SheetPreview
            name={card.hero.name}
            meta={card.hero.meta}
            abilities={card.hero.abilities}
            derived={card.hero.derived}
          />
        ) : detail.assets.length > 0 ? (
          <div className="flex flex-col gap-3">
            {detail.assets.map(asset => (
              // Our own route, so not next/image — see EntryCard.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={asset.id}
                src={asset.url}
                alt={asset.alt || card.title}
                className="w-full rounded-[var(--radius-card)] border border-line"
              />
            ))}
          </div>
        ) : (
          <SectionCard>
            <p className="text-sm text-ink-subtle">
              Whatever this listing pointed at is no longer readable. The author
              deleted it and nothing was frozen in time to take its place.
            </p>
          </SectionCard>
        )}

        {card.summary && (
          <p className="max-w-2xl text-ink-muted">{card.summary}</p>
        )}
      </div>

      <aside className="flex flex-col gap-4 border-line lg:border-l lg:pl-6">
        <div className="flex flex-wrap items-center gap-2">
          {card.mine && <Ribbon tone="gold">Yours</Ribbon>}
          {card.adopted === 'linked' && <Ribbon tone="arcane">Taken</Ribbon>}
          {card.adopted === 'forked' && <Ribbon tone="arcane">Copied</Ribbon>}
          {card.status === 'withdrawn' && (
            <Ribbon tone="danger">Off the shelf</Ribbon>
          )}
          {card.visibility === 'unlisted' && (
            <Ribbon tone="neutral">Unlisted</Ribbon>
          )}
        </div>

        <div className="text-sm text-ink-muted">
          <div className="flex items-center gap-1.5">
            <Glyph name={kindMeta.glyph} size={14} className="text-gold" />
            {typeMeta ? typeMeta.label : kindMeta.label}
          </div>
          <p className="mt-1">Written by {card.credit}</p>
          <p className="mt-1 tabular-nums">
            {card.adoptions === 0
              ? 'On nobody else’s shelf yet'
              : `On ${card.adoptions} other ${
                  card.adoptions === 1 ? 'shelf' : 'shelves'
                }`}
          </p>
        </div>

        {detail.items.length > 0 && (
          <div className="text-sm text-ink-muted">
            <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-gold/80">
              Travels with it
            </h3>
            <ul className="mt-1 space-y-0.5">
              {detail.items.map(item => (
                <li key={item.id} className="flex items-center gap-1.5">
                  {item.contentType && (
                    <Glyph
                      name={contentMeta(item.contentType).glyph}
                      size={13}
                    />
                  )}
                  <span className="truncate">{item.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {card.tags.map(t => (
              <Pill key={t}>{t}</Pill>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        {!card.mine && (
          <div className="flex flex-col gap-2">
            <AdoptControls
              card={card}
              layout="column"
              onDone={() => router.refresh()}
            />
            {card.adopted === null && card.kind === 'homebrew' && (
              <Marginalia>
                take it and it stays theirs; copy it and it stops changing
              </Marginalia>
            )}
          </div>
        )}

        {card.mine && (
          <div className="flex flex-col gap-2">
            <Button
              variant="bordered"
              isDisabled={busy}
              onPress={() =>
                run(() =>
                  setPublicationStatusAction(
                    card.id,
                    card.status === 'listed' ? 'withdrawn' : 'listed'
                  )
                )
              }
            >
              {card.status === 'listed'
                ? 'Take it off the shelf'
                : 'Put it back on the shelf'}
            </Button>
            <Button
              variant="light"
              color="danger"
              isDisabled={busy}
              onPress={async () => {
                const ok = await confirm({
                  title: 'Delete this listing?',
                  body: 'The listing goes, and so does the record of who took it. What people already took stays theirs — this cannot reach into their tables.',
                  confirmLabel: 'Delete the listing',
                  destructive: true,
                });
                if (ok) {
                  await run(
                    () => deletePublicationAction(card.id),
                    () => router.push('/library')
                  );
                }
              }}
            >
              Delete the listing
            </Button>
            <Button as={Link} href="/creator/homebrew" variant="light">
              Edit it in the Forge
            </Button>
          </div>
        )}

        {fromSnapshot && card.kind === 'homebrew' && (
          <Marginalia dash>
            the author’s copy is gone — this is how it was
          </Marginalia>
        )}
      </aside>
      {dialog}
    </div>
  );
}
