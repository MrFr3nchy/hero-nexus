'use client';

import { characterService } from '@/@creator/services';
import { Button, Card, CardBody, CardHeader, Spinner } from '@heroui/react';
import { useEffect, useState } from 'react';

interface Character {
  id: string;
  characterName: string;
  class: string;
  species: string;
  level: number;
  background: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export function CharactersList() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      setLoading(true);
      setError(null);
      const charactersData = await characterService.getCharacters();
      setCharacters(charactersData as unknown as Character[]);
    } catch (err) {
      console.error('Error loading characters:', err);
      setError('Failed to load characters');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (confirm('Are you sure you want to delete this character?')) {
      try {
        await characterService.deleteCharacter(characterId);
        setCharacters(prev => prev.filter(char => char.id !== characterId));
        alert('Character deleted successfully!');
      } catch (err) {
        console.error('Error deleting character:', err);
        alert('Failed to delete character');
      }
    }
  };

  const formatDate = (timestamp: unknown) => {
    if (!timestamp) return 'Unknown';
    if (
      typeof timestamp === 'object' &&
      timestamp !== null &&
      'toDate' in timestamp
    ) {
      return (timestamp as { toDate: () => Date })
        .toDate()
        .toLocaleDateString();
    }
    return new Date(timestamp as string | number).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="mb-4" />
          <p className="text-white text-lg">Loading characters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            🗡️ Your Characters
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Manage and view all your created characters
          </p>
        </div>

        {/* Error State */}
        {error && (
          <Card className="bg-red-900/50 backdrop-blur-sm border-red-600/30 mb-8">
            <CardBody>
              <p className="text-red-200">{error}</p>
              <Button
                color="danger"
                variant="light"
                onPress={loadCharacters}
                className="mt-2"
              >
                Try Again
              </Button>
            </CardBody>
          </Card>
        )}

        {/* Characters Grid */}
        {characters.length === 0 ? (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
            <CardBody className="text-center py-12">
              <h3 className="text-2xl font-bold text-amber-300 mb-4">
                No Characters Yet
              </h3>
              <p className="text-gray-300 mb-6">
                Create your first character to get started!
              </p>
              <Button
                color="primary"
                size="lg"
                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"
                onPress={() => (window.location.href = '/creator/character')}
              >
                Create Character
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters.map(character => (
              <Card
                key={character.id}
                className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30 hover:border-amber-500/50 transition-colors"
              >
                <CardHeader>
                  <div className="flex justify-between items-start w-full">
                    <div>
                      <h3 className="text-xl font-bold text-amber-300">
                        {character.characterName || 'Unnamed Character'}
                      </h3>
                      <p className="text-gray-400">
                        Level {character.level} {character.class}
                      </p>
                    </div>
                    <div className="text-right text-sm text-gray-400">
                      <p>Created: {formatDate(character.createdAt)}</p>
                      <p>Updated: {formatDate(character.updatedAt)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="space-y-2 mb-4">
                    <p className="text-gray-300">
                      <span className="text-amber-200 font-semibold">
                        Species:
                      </span>{' '}
                      {character.species || 'Unknown'}
                    </p>
                    <p className="text-gray-300">
                      <span className="text-amber-200 font-semibold">
                        Background:
                      </span>{' '}
                      {character.background || 'Unknown'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      color="primary"
                      variant="flat"
                      size="sm"
                      className="flex-1"
                      onPress={() => {
                        // TODO: Implement edit functionality
                        alert('Edit functionality coming soon!');
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      color="danger"
                      variant="flat"
                      size="sm"
                      onPress={() => handleDeleteCharacter(character.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* Refresh Button */}
        <div className="flex justify-center mt-8">
          <Button
            color="primary"
            variant="bordered"
            onPress={loadCharacters}
            className="border-amber-600 text-amber-300 hover:bg-amber-600/10"
          >
            Refresh List
          </Button>
        </div>
      </div>
    </div>
  );
}
