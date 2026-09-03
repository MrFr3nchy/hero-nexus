import { notFound } from 'next/navigation';

import { getCharacterAction } from '@/@creator/character/actions';
import { CharacterForm } from '@/@creator/character/components';
import { loadReferenceOptions } from '@/@creator/character/lib/reference-options';
import { loadBuildCatalog } from '@/@creator/character/lib/srd/catalog';
import { getCampaignAction } from '@/@creator/campaign/actions';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';

interface PageProps {
  searchParams: Promise<{ id?: string; campaign?: string }>;
}

export default async function CharacterCreationPage({
  searchParams,
}: PageProps) {
  const { id, campaign: campaignId } = await searchParams;
  const [reference, catalog] = await Promise.all([
    loadReferenceOptions(),
    loadBuildCatalog(),
  ]);

  const existing = id ? await getCharacterAction(id) : null;
  if (id && !existing) notFound();

  // A campaign context is optional. If the viewer isn't a member of the given
  // campaign, `getCampaignAction` returns null and the builder is unconstrained.
  const campaign = campaignId ? await getCampaignAction(campaignId) : null;

  return (
    <ProtectedRoute>
      <PageShell width="full">
        <PageHeader
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
          campaignRules={campaign?.settings.rules}
          campaignAllowHomebrew={campaign?.settings.allowHomebrew ?? true}
          campaignName={campaign?.name}
        />
      </PageShell>
    </ProtectedRoute>
  );
}
