import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import { PageHeader, PageShell, SectionCard } from '@/@shared/components/ui';
import { getReference } from '@/server/reference';

export const dynamic = 'force-dynamic';

export default async function ClassesPage() {
  const classes = await getReference('class');
  const entries = classes
    .filter(c => !(c.data as { subclass_of?: unknown })?.subclass_of)
    .map(c => ({
      slug: c.slug,
      name: c.name,
      data: c.data as Record<string, unknown>,
    }));

  return (
    <PageShell width="wide">
      <PageHeader
        title="Classes"
        description="The SRD 5.2 base classes, synced from Open5e."
      />
      <SectionCard>
        <ReferenceBrowser variant="class" entries={entries} />
      </SectionCard>
    </PageShell>
  );
}
