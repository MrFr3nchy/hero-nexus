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
  const [reference, campaigns, existing] = await Promise.all([
    loadReferenceOptions(),
    // Signed out, this page renders only to hand off to ProtectedRoute's
    // client-side redirect, so a missing session must not throw here.
    listBuilderCampaignsAction().catch(() => []),
    id ? getCharacterAction(id) : Promise.resolve(null),
  ]);
  if (id && !existing) notFound();

  // A campaign is optional. `?campaign=` preselects one; reopening a character
  // that already plays somewhere preselects that table instead.
  const linked = campaigns.find(c => c.linkedCharacterId === existing?.id);
  const selected = linked?.id ?? campaignId;

  // Loaded after the table is known rather than alongside it: the catalog
  // carries that table's homebrew library, so building it against `?campaign=`
  // alone would open a linked character with the wrong table's options.
  const catalog = await loadBuildCatalog({ campaignId: selected });

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
          catalogCampaignId={selected}
        />
      </PageShell>
    </ProtectedRoute>
  );
}
