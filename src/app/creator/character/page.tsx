import { notFound } from 'next/navigation';

import { getCharacterAction } from '@/@creator/character/actions';
import { CharacterForm } from '@/@creator/character/components';
import { loadReferenceOptions } from '@/@creator/character/lib/reference-options';
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
  const reference = await loadReferenceOptions();

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
              : 'Fill in the D&D 5e (2024) sheet. Modifiers and DCs are worked out for you.'
          }
        />
        <CharacterForm
          reference={reference}
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
