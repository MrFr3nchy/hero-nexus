import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CharacterSheetView } from '@/@creator/character/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';
import { getCharacterForCampaign } from '@/server/characters';

export const dynamic = 'force-dynamic';

export default async function CampaignPlayerSheetPage({
  params,
}: {
  params: Promise<{ id: string; characterId: string }>;
}) {
  const { id, characterId } = await params;

  let character;
  try {
    character = await getCharacterForCampaign(id, characterId);
  } catch {
    notFound();
  }
  if (!character) notFound();

  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <PageHeader
          eyebrow={
            <Link href={`/campaigns/${id}`} className="hover:text-ink">
              ← Campaign
            </Link>
          }
          title={character.name || 'Character'}
          description={`Level ${character.level} ${character.class} · ${character.species} · read-only`}
        />
        <CharacterSheetView sheet={character.sheet} />
      </PageShell>
    </ProtectedRoute>
  );
}
