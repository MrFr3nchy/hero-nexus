import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { listShelfContent } from '@/server/content';
import { isForged } from '@/@shared/content';
import { getReference } from '@/server/reference';

export const dynamic = 'force-dynamic';

export default async function ClassesPage() {
  // The adapter already drops the subclass rows Open5e mixes into `classes`;
  // the raw rows are still counted, for the ledger line.
  const [items, rawClasses] = await Promise.all([
    listShelfContent('class'),
    getReference('class'),
  ]);
  const forged = items.filter(isForged).length;
  const subclasses = rawClasses.length - (items.length - forged);

  return (
    <PageShell width="wide">
      {/* Collection archetype — see the note on /spells. */}
      <PageHeader
        rule={false}
        title="Classes"
        description="The SRD 5.2 base classes and everything you have forged."
      />
      {items.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: items.length, label: 'classes' },
              { value: subclasses, label: 'subclasses behind them' },
              ...(forged > 0 ? [{ value: forged, label: 'forged' }] : []),
            ]}
          />
          <Marginalia dash className="mb-5">
            pick one. regret it at level 5. that is the tradition.
          </Marginalia>
        </>
      )}
      <ReferenceBrowser
        type="class"
        items={items}
        createHref="/creator/homebrew?type=class"
      />
    </PageShell>
  );
}
