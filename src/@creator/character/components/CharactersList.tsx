'use client';

import { Button, Link } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  CandleScene,
  DiceSpinner,
  EmptyState,
  Glyph,
  HeroCard,
  Marginalia,
  PageHeader,
  PageShell,
  Ribbon,
  useConfirm,
} from '@/@shared/components/ui';
import type { CharacterRow } from '@/server/characters';
import { deleteCharacterAction, listCharactersAction } from '../actions';

export function CharactersList() {
  const [characters, setCharacters] = useState<CharacterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      setError(null);
      setCharacters(await listCharactersAction());
    } catch (err) {
      console.error('Error loading characters:', err);
      setError('Failed to load characters');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (c: CharacterRow) => {
    const draft = c.status === 'draft';
    const ok = await confirm({
      title: `${draft ? 'Discard' : 'Retire'} ${c.name || 'this character'}?`,
      body: draft
        ? 'An unfinished build, thrown back on the fire. Nothing else points at it.'
        : 'The sheet and its change log are removed for good.',
      confirmLabel: draft ? 'Discard' : 'Retire',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteCharacterAction(c.id);
      setCharacters(prev => prev?.filter(x => x.id !== c.id) ?? null);
    } catch (err) {
      console.error('Error deleting character:', err);
      setError('Failed to delete character');
    }
  };

  const ready = characters?.filter(c => c.status !== 'draft') ?? [];
  const drafts = characters?.filter(c => c.status === 'draft') ?? [];

  return (
    <PageShell width="full">
      {dialog}
      <PageHeader
        rule={false}
        title="Your heroes"
        description="Every character you've built for the table."
        actions={
          <Button as={Link} href="/creator/character" color="primary" size="sm">
            New character
          </Button>
        }
      />

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <Button size="sm" variant="light" onPress={load}>
            Retry
          </Button>
        </div>
      )}

      {!characters ? (
        <div className="flex justify-center py-16">
          <DiceSpinner label="Gathering your heroes…" />
        </div>
      ) : characters.length === 0 ? (
        <EmptyState
          scene={<CandleScene />}
          title="No one has pulled up a chair yet"
          description="Roll up your first hero and they'll be waiting here."
          action={
            <Button as={Link} href="/creator/character" color="primary">
              Create your first hero
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-5">
            {ready.map(c => (
              <Card key={c.id} character={c} onDelete={handleDelete} />
            ))}
            <Link
              href="/creator/character"
              className="flex w-52 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center transition-colors hover:border-gold hover:bg-gold/[0.04]"
            >
              <Glyph name="plus" size={22} className="text-gold" />
              <span className="font-hand text-lg text-ink-subtle">
                Roll a new one
              </span>
            </Link>
          </div>

          {/*
            Drafts stand apart because they behave differently: they cannot
            take a seat at a table or go on the Library's shelf until they are
            finished. Mixing them into the party would put heroes who can do
            neither beside heroes who can, with nothing on the card to say so.
          */}
          {drafts.length > 0 && (
            <section className="mt-10 border-t border-line pt-6">
              <h2 className="font-display text-xl text-ink">
                Still being built
              </h2>
              <Marginalia dash className="mb-4">
                no chair, no shelf, not yet
              </Marginalia>
              <div className="flex flex-wrap gap-5">
                {drafts.map(c => (
                  <Card
                    key={c.id}
                    character={c}
                    onDelete={handleDelete}
                    draft
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}

/**
 * One hero on the roster. `draft` adds the `Ribbon` that says why this one
 * cannot yet do what the others can (design rule 6: ornament encodes state)
 * and points its click at the builder rather than the finished sheet — there
 * is no finished sheet to read.
 *
 * The table a hero sits at is the card's `note`, in the margin voice, and it
 * is never the only way that fact is available — the sheet names it in its
 * header too (rule 5: marginalia is not load-bearing). Before this the roster
 * could not say it at all, which is how a player ends up opening five sheets
 * looking for the one their DM meant.
 */
function Card({
  character: c,
  onDelete,
  draft = false,
}: {
  character: CharacterRow;
  onDelete: (c: CharacterRow) => void;
  draft?: boolean;
}) {
  const note = c.table
    ? `at ${c.table.name}`
    : c.hasHomebrew
      ? 'homebrew in play'
      : undefined;

  return (
    <div className="group relative w-52">
      <HeroCard
        layout="stack"
        href={draft ? `/creator/character?id=${c.id}` : `/characters/${c.id}`}
        name={c.name || 'Unnamed character'}
        charClass={c.class || undefined}
        level={c.level}
        species={c.species || undefined}
        note={note}
        portrait={
          c.portrait ? (
            /* A linked portrait is an arbitrary off-site host, which
               `next/image` would need configuring for one domain at a time. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.portrait.url}
              alt={c.portrait.alt || `${c.name || 'Character'} portrait`}
              className="h-full w-full object-cover"
            />
          ) : undefined
        }
      />
      {draft && (
        <Ribbon tone="warning" className="absolute -left-1 top-3">
          Draft
        </Ribbon>
      )}
      <div className="absolute -right-2 -top-2 hidden gap-1 group-hover:flex">
        {/* A draft has nothing to run — no hit points, no dice to spend. */}
        {!draft && (
          <Link
            href={`/characters/${c.id}/play`}
            aria-label={`Run ${c.name || 'character'}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle shadow-sm transition-colors hover:text-gold"
          >
            <Glyph name="die" size={13} />
          </Link>
        )}
        <Link
          href={`/creator/character?id=${c.id}`}
          aria-label={`${draft ? 'Continue' : 'Edit'} ${c.name || 'character'}`}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle shadow-sm transition-colors hover:text-gold"
        >
          <Glyph name="pencil" size={13} />
        </Link>
        <button
          type="button"
          onClick={() => onDelete(c)}
          aria-label={`${draft ? 'Discard' : 'Retire'} ${c.name || 'character'}`}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle shadow-sm transition-colors hover:text-danger"
        >
          <Glyph name="x" size={13} />
        </button>
      </div>
    </div>
  );
}
