import { notFound } from 'next/navigation';

import { getCharacterAction } from '@/@creator/character/actions';
import { CharacterForm } from '@/@creator/character/components';
import { loadReferenceOptions } from '@/@creator/character/lib/reference-options';
import { loadBuildCatalog } from '@/@creator/character/lib/srd/catalog';
import { listBuilderCampaignsAction } from '@/@creator/campaign/actions';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';

interface PageProps {
  searchParams: Promise<{ id?: string; campaign?: string }>;
}

export default async function CharacterCreationPage({
  searchParams,
}: PageProps) {
  const { id, campaign: campaignId } = await searchParams;
  const [reference, catalog, campaigns] = await Promise.all([
    loadReferenceOptions(),
    loadBuildCatalog(),
    // Signed out, this page renders only to hand off to ProtectedRoute's
    // client-side redirect, so a missing session must not throw here.
    listBuilderCampaignsAction().catch(() => []),
  ]);

  const existing = id ? await getCharacterAction(id) : null;
  if (id && !existing) notFound();

  // A campaign is optional. `?campaign=` preselects one; reopening a character
  // that already plays somewhere preselects that table instead.
  const linked = campaigns.find(c => c.linkedCharacterId === existing?.id);
  const selected = linked?.id ?? campaignId;

  return (
    <ProtectedRoute>
      <PageShell width="full">
        <PageHeader
          rule={false}
          title={
            existing ? existing.name || 'Edit character' : 'Character creator'
          }
          description={
            existing
              ? 'Update the sheet and save your changes.'
              : 'Nine steps. Everything your class, species and background grant is filled in as you choose it.'
          }
        />
        <CharacterForm
          reference={reference}
          catalog={catalog}
          characterId={existing?.id}
          initialSheet={existing?.sheet}
          campaigns={campaigns}
          initialCampaignId={selected}
        />
      </PageShell>
    </ProtectedRoute>
  );
}
