'use client';

import { Button, Link } from '@heroui/react';
import { Icon } from '@iconify/react';
import { useCallback, useEffect, useState } from 'react';

import {
  CandleScene,
  DiceSpinner,
  EmptyState,
  HeroCard,
  PageHeader,
  PageShell,
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
    const ok = await confirm({
      title: `Retire ${c.name || 'this character'}?`,
      body: 'The sheet and its change log are removed for good.',
      confirmLabel: 'Retire',
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
        <div className="flex flex-wrap gap-5">
          {characters.map(c => (
            <div key={c.id} className="group relative w-52">
              <HeroCard
                layout="stack"
                href={`/creator/character?id=${c.id}`}
                name={c.name || 'Unnamed character'}
                charClass={c.class || undefined}
                level={c.level}
                species={c.species || undefined}
                note={c.hasHomebrew ? 'homebrew in play' : undefined}
              />
              <button
                type="button"
                onClick={() => handleDelete(c)}
                aria-label={`Retire ${c.name || 'character'}`}
                className="absolute -right-2 -top-2 hidden h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle shadow-sm transition-colors hover:text-danger group-hover:flex"
              >
                <Icon icon="ph:x-bold" width={13} />
              </button>
            </div>
          ))}
          <Link
            href="/creator/character"
            className="flex w-52 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center transition-colors hover:border-gold hover:bg-gold/[0.04]"
          >
            <span className="text-2xl text-gold">✦</span>
            <span className="font-hand text-lg text-ink-subtle">
              Roll a new one
            </span>
          </Link>
        </div>
      )}
    </PageShell>
  );
}
