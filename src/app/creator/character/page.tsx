import { notFound } from 'next/navigation';

import { getCharacterAction } from '@/@creator/character/actions';
import { CharacterForm } from '@/@creator/character/components';
import { loadReferenceOptions } from '@/@creator/character/lib/reference-options';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';

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
      <PageShell width="full">
        <PageHeader
          eyebrow={existing ? 'Edit' : 'New character'}
          title={
            existing ? existing.name || 'Edit character' : 'Character creator'
          }
          description={
            existing
              ? 'Update the sheet and save your changes.'
              : 'Fill in the D&D 5e (2024) sheet. Modifiers and DCs are worked out for you.'
          }
        />
        <CharacterForm
          reference={reference}
          characterId={existing?.id}
          initialSheet={existing?.sheet}
        />
      </PageShell>
    </ProtectedRoute>
  );
}
