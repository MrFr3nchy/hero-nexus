'use client';

import { Button, Chip, Link } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  PageHeader,
  PageShell,
  SectionCard,
} from '@/@shared/components/ui';
import type { CharacterRow } from '@/server/characters';
import { deleteCharacterAction, listCharactersAction } from '../actions';

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString();
}

function CharacterGrid({
  characters,
  onDelete,
}: {
  characters: CharacterRow[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {characters.map(c => (
        <div
          key={c.id}
          className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4"
        >
          <div className="mb-3">
            <h3 className="font-display text-lg text-ink">
              {c.name || 'Unnamed character'}
            </h3>
            <p className="text-sm text-ink-muted">
              Level {c.level} {c.class || '—'}
              {c.species ? ` · ${c.species}` : ''}
            </p>
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
            {c.background && (
              <Chip size="sm" variant="flat" className="bg-surface-2">
                {c.background}
              </Chip>
            )}
            {c.hasHomebrew && (
              <Chip
                size="sm"
                variant="flat"
                className="border border-arcane/40 bg-arcane/10 text-arcane"
              >
                Homebrew
              </Chip>
            )}
            <Chip size="sm" variant="flat" className="bg-surface-2">
              Updated {formatDate(c.updatedAt)}
            </Chip>
          </div>
          <div className="mt-auto flex gap-2">
            <Button
              as={Link}
              href={`/creator/character?id=${c.id}`}
              size="sm"
              variant="flat"
              className="flex-1"
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted data-[hover=true]:text-danger"
              onPress={() => onDelete(c.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CharactersList({ embedded = false }: { embedded?: boolean }) {
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCharacters(await listCharactersAction());
    } catch (err) {
      console.error('Error loading characters:', err);
      setError('Failed to load characters');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this character? This cannot be undone.')) return;
    try {
      await deleteCharacterAction(id);
      setCharacters(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Error deleting character:', err);
      setError('Failed to delete character');
    }
  };

  const body = loading ? (
    <div className="flex justify-center py-12">
      <DiceSpinner label="Gathering your heroes…" />
    </div>
  ) : error ? (
    <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      <span>{error}</span>
      <Button size="sm" variant="light" onPress={load}>
        Retry
      </Button>
    </div>
  ) : characters.length === 0 ? (
    <EmptyState
      icon="🗡️"
      title="No characters yet"
      description="Create your first character to get started."
      action={
        <Button as={Link} href="/creator/character" color="primary">
          Create a character
        </Button>
      }
    />
  ) : (
    <CharacterGrid characters={characters} onDelete={handleDelete} />
  );

  if (embedded) return body;

  return (
    <PageShell width="full">
      <PageHeader
        eyebrow="Roster"
        title="Your characters"
        description="Every hero you've built."
        actions={
          <Button as={Link} href="/creator/character" color="primary" size="sm">
            New character
          </Button>
        }
      />
      <SectionCard>{body}</SectionCard>
    </PageShell>
  );
}
