import { notFound } from 'next/navigation';

import { getCharacterAction } from '@/@creator/character/actions';
import { CharacterForm } from '@/@creator/character/components';
import { loadReferenceOptions } from '@/@creator/character/lib/reference-options';
import { loadBuildCatalog } from '@/@creator/character/lib/srd/catalog';
import { listBuilderCampaignsAction } from '@/@creator/campaign/actions';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';

interface PageProps {
  searchParams: Promise<{
    id?: string;
    campaign?: string;
    /** The three picks a shelf can hand off; see `initialPick` below. */
    class?: string;
    species?: string;
    background?: string;
    /** `?intent=level-up` — the "Level up" link from the roster or play view. */
    intent?: string;
  }>;
}

export default async function CharacterCreationPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const { id, campaign: campaignId } = params;
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

  /**
   * "Start a hero with this" on a compendium shelf. Unvalidated here on
   * purpose: the catalog is the authority on what may be picked (a homebrew
   * class the table has banned is not in it), so the wizard matches the key
   * against the catalog it was given and quietly ignores one that is not
   * there.
   */
  const initialPick = params.class
    ? ({ kind: 'class', key: params.class } as const)
    : params.species
      ? ({ kind: 'species', key: params.species } as const)
      : params.background
        ? ({ kind: 'background', key: params.background } as const)
        : undefined;

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
              ? params.intent === 'level-up'
                ? 'One more level. Take the hit points, pick what it grants, and save.'
                : existing.status === 'draft'
                  ? 'Pick up where you left off. Nothing is owed until you finish.'
                  : 'Update the sheet and save your changes.'
              : 'Eight steps, in any order. Everything your class, species and background grant is filled in as you choose it — and you can save a draft at any point.'
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
          initialPick={initialPick}
          initialStatus={existing?.status}
          intent={params.intent === 'level-up' ? 'level-up' : undefined}
          playsAt={existing?.table ?? null}
          forkedFrom={existing?.forkedFrom ?? null}
        />
      </PageShell>
    </ProtectedRoute>
  );
}
