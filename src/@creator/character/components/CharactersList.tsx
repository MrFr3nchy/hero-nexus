'use client';

import { Button, Card, CardBody, CardHeader, Spinner } from '@heroui/react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { deleteCharacterAction, listCharactersAction } from '../actions';
import type { CharacterRow } from '@/server/characters';

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString();
}

export function CharactersList() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Spinner size="lg" color="warning" className="mb-4" />
          <p className="text-amber-200">Loading characters…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-amber-300">
          Your Characters ({characters.length})
        </h2>
        <Button
          as={Link}
          href="/creator/character"
          className="bg-gradient-to-r from-amber-600 to-orange-600"
        >
          + New Character
        </Button>
      </div>

      {error && (
        <Card className="border-red-600/30 bg-red-900/40">
          <CardBody className="flex flex-row items-center justify-between">
            <p className="text-red-200">{error}</p>
            <Button color="danger" variant="light" onPress={load}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      {characters.length === 0 ? (
        <Card className="border-amber-600/30 bg-slate-800/50">
          <CardBody className="py-12 text-center">
            <h3 className="mb-2 text-xl font-bold text-amber-300">
              No characters yet
            </h3>
            <p className="mb-6 text-gray-300">
              Create your first character to get started.
            </p>
            <Button
              as={Link}
              href="/creator/character"
              size="lg"
              className="bg-gradient-to-r from-amber-600 to-orange-600"
            >
              Create Character
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {characters.map(character => (
            <Card
              key={character.id}
              className="border-amber-600/30 bg-slate-800/50 transition-colors hover:border-amber-500/50"
            >
              <CardHeader className="flex-col items-start">
                <h3 className="text-xl font-bold text-amber-300">
                  {character.name || 'Unnamed Character'}
                </h3>
                <p className="text-sm text-gray-400">
                  Level {character.level} {character.class || '—'}
                </p>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="space-y-1 text-sm text-gray-300">
                  <p>
                    <span className="font-semibold text-amber-200">
                      Species:
                    </span>{' '}
                    {character.species || 'Unknown'}
                  </p>
                  <p>
                    <span className="font-semibold text-amber-200">
                      Background:
                    </span>{' '}
                    {character.background || 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Updated {formatDate(character.updatedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    as={Link}
                    href={`/creator/character?id=${character.id}`}
                    color="primary"
                    variant="flat"
                    size="sm"
                    className="flex-1"
                  >
                    Edit
                  </Button>
                  <Button
                    color="danger"
                    variant="flat"
                    size="sm"
                    onPress={() => handleDelete(character.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
