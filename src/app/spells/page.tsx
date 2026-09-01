import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import { PageHeader, PageShell, SectionCard } from '@/@shared/components/ui';
import { getReference } from '@/server/reference';

export const dynamic = 'force-dynamic';

export default async function SpellsPage() {
  const spells = await getReference('spell');
  const entries = spells.map(s => ({
    slug: s.slug,
    name: s.name,
    data: s.data as Record<string, unknown>,
  }));

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Compendium"
        title="Spells"
        description={`${entries.length} spells from the SRD, synced from Open5e.`}
      />
      <SectionCard>
        <ReferenceBrowser variant="spell" entries={entries} />
      </SectionCard>
    </PageShell>
  );
}
