import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { getReference } from '@/server/reference';

export const dynamic = 'force-dynamic';

export default async function ClassesPage() {
  const classes = await getReference('class');
  const all = classes.map(c => ({
    slug: c.slug,
    name: c.name,
    data: c.data as Record<string, unknown>,
  }));

  const entries = all.filter(
    c => !(c.data as { subclass_of?: unknown })?.subclass_of
  );
  const subclasses = all.length - entries.length;

  return (
    <PageShell width="wide">
      {/* Collection archetype — see the note on /spells. */}
      <PageHeader
        rule={false}
        title="Classes"
        description="The SRD 5.2 base classes, synced from Open5e."
      />
      {entries.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: entries.length, label: 'classes' },
              { value: subclasses, label: 'subclasses behind them' },
            ]}
          />
          <Marginalia dash className="mb-5">
            pick one. regret it at level 5. that is the tradition.
          </Marginalia>
        </>
      )}
      <ReferenceBrowser variant="class" entries={entries} />
    </PageShell>
  );
}
