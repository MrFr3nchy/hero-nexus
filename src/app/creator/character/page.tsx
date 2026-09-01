import { notFound } from 'next/navigation';

import { CharacterForm } from '@/@creator/character/components';
import { getCharacterAction } from '@/@creator/character/actions';
import { loadReferenceOptions } from '@/@creator/character/lib/reference-options';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function CharacterCreationPage({
  searchParams,
}: PageProps) {
  const { id } = await searchParams;
  const reference = await loadReferenceOptions();

  const existing = id ? await getCharacterAction(id) : null;
  if (id && !existing) notFound();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 text-center">
            <h1 className="mb-4 text-4xl font-bold text-white">
              🗡️ {existing ? 'Edit Character' : 'Character Creation'}
            </h1>
            <p className="mx-auto max-w-3xl text-xl text-gray-300">
              {existing
                ? `Editing ${existing.name || 'your character'}`
                : 'Create your legendary hero using the D&D 5e (2024) character sheet'}
            </p>
          </div>
          <CharacterForm
            reference={reference}
            characterId={existing?.id}
            initialSheet={existing?.sheet}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
