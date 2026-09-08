import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { listSrdContent } from '@/server/content';
import { getReference } from '@/server/reference';

export const dynamic = 'force-dynamic';

export default async function ClassesPage() {
  // `listSrdContent` already drops the subclass rows Open5e mixes into
  // `classes`; the raw rows are still counted, for the ledger line.
  const [entries, rawClasses] = await Promise.all([
    listSrdContent('class'),
    getReference('class'),
  ]);
  const subclasses = rawClasses.length - entries.length;

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
      <ReferenceBrowser type="class" entries={entries} />
    </PageShell>
  );
}
