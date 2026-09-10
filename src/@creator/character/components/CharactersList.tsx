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

  /*
   * A hero and the copies of them that are out playing, as one group.
   *
   * Showing blueprints alone would be tidier and is the wrong call: a player
   * who takes Gon to a table and then opens this page to a level 1 Gon has
   * watched their character reset, and no amount of correctness underneath
   * answers that. The relationship is the thing being rendered.
   *
   * A hero seated before instancing existed has a `campaignId` and no
   * `forkedFrom`, so they lead their own group — which is the truth: nothing
   * was forked from anything.
   */
  const groups = (() => {
    const byId = new Map(ready.map(c => [c.id, c]));
    const instances = new Map<string, CharacterRow[]>();
    for (const c of ready) {
      if (!c.forkedFrom || !byId.has(c.forkedFrom)) continue;
      instances.set(c.forkedFrom, [...(instances.get(c.forkedFrom) ?? []), c]);
    }
    return ready
      .filter(c => !c.forkedFrom || !byId.has(c.forkedFrom))
      .map(lead => ({ lead, played: instances.get(lead.id) ?? [] }));
  })();

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
          <div className="flex flex-wrap items-start gap-5">
            {groups.map(({ lead, played }) =>
              played.length === 0 ? (
                <CardWithCaption
                  key={lead.id}
                  character={lead}
                  onDelete={handleDelete}
                />
              ) : (
                <HeroGroup
                  key={lead.id}
                  lead={lead}
                  played={played}
                  onDelete={handleDelete}
                />
              )
            )}
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
 * What a card needs said under it, or '' when it needs nothing.
 *
 * A blueprint standing on its own says nothing — it is just a hero. Every
 * *instance* says something, whether or not it has a blueprint above it in the
 * list, because a card wearing a table's name and a different level from the
 * one beside it is exactly the moment a player wonders what happened to their
 * character.
 */
function captionFor(c: CharacterRow): string {
  if (!c.campaignId) return '';
  if (!c.table) {
    return 'Played at a table that has since gone. Kept as it was left.';
  }
  return c.seated
    ? `Playing at ${c.table.name}. Levels and loot land here, not on the original.`
    : `Played at ${c.table.name}, not in the chair now. Kept exactly as they were left.`;
}

/** A roster card with the line that explains which copy it is. */
function CardWithCaption({
  character,
  onDelete,
  caption,
  draft = false,
}: {
  character: CharacterRow;
  onDelete: (c: CharacterRow) => void;
  /** Overrides the derived one — the blueprint's line inside a group. */
  caption?: string;
  draft?: boolean;
}) {
  const line = caption ?? captionFor(character);
  return (
    <div>
      <Card character={character} onDelete={onDelete} draft={draft} />
      {line && <p className="mt-2 w-52 text-xs text-ink-subtle">{line}</p>}
    </div>
  );
}

/**
 * A hero and the copies of them out at tables.
 *
 * The blueprint is drawn first and labelled as the copy that never plays; each
 * instance sits beside it under its table's name, carrying that table's real
 * level and hit points. Both are shown because the alternative — hiding one —
 * is how a player concludes their character reset.
 *
 * The wrapper is a plain bordered well rather than a `SectionCard`: this is a
 * grouping of objects, not a titled panel, and a card around it would compete
 * with the cards inside it.
 */
function HeroGroup({
  lead,
  played,
  onDelete,
}: {
  lead: CharacterRow;
  played: CharacterRow[];
  onDelete: (c: CharacterRow) => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line/70 bg-surface-2/30 p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-display text-lg text-ink">{lead.name}</h2>
        <Marginalia dash>
          {played.filter(c => c.seated).length === 1
            ? 'one of them is out playing'
            : played.some(c => c.seated)
              ? `${played.filter(c => c.seated).length} of them are out playing`
              : 'none of them are at a table right now'}
        </Marginalia>
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <CardWithCaption
          character={lead}
          onDelete={onDelete}
          caption="The original. Never levels, never dies — this is the one that goes to a new table."
        />
        {played.map(c => (
          <CardWithCaption key={c.id} character={c} onDelete={onDelete} />
        ))}
      </div>
    </div>
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
  // The table is carried by the Ribbon below, so the margin line is free to
  // say the other thing worth knowing (rule 5: never load-bearing either way).
  const note = c.hasHomebrew ? 'homebrew in play' : undefined;

  return (
    <div className="group relative w-52">
      <HeroCard
        layout="stack"
        href={draft ? `/creator/character?id=${c.id}` : `/characters/${c.id}`}
        name={c.name || 'Unnamed character'}
        charClass={c.class || undefined}
        level={c.level}
        species={c.species || undefined}
        hp={c.hp ?? undefined}
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
      {/*
        Ornament encodes state (rule 6): a gold ribbon means this copy is the
        one in play at a table. A blueprint wears none, which is what makes the
        two tellable apart at a glance inside a group.
      */}
      {!draft && c.table && (
        <Ribbon
          tone={c.seated ? 'gold' : 'neutral'}
          className="absolute -left-1 top-3"
        >
          {c.table.name}
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
