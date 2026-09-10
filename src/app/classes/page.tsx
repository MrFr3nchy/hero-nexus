import { ShelfTabs } from '@/@shared/components/ShelfTabs';
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
  const [items, subclasses, rawClasses] = await Promise.all([
    listShelfContent('class'),
    listShelfContent('subclass'),
    getReference('class'),
  ]);
  const forged = items.filter(isForged).length;
  const srdSubclasses = rawClasses.length - (items.length - forged);

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
              { value: srdSubclasses, label: 'subclasses behind them' },
              ...(forged > 0 ? [{ value: forged, label: 'forged' }] : []),
            ]}
          />
          <Marginalia dash className="mb-5">
            pick one. regret it at level 5. that is the tradition.
          </Marginalia>
        </>
      )}
      {/*
        Subclasses share this page rather than taking a nav row of their own.
        The SRD keeps them inside the class rows — `CATEGORIES_FOR.subclass` is
        empty — so their shelf holds only forged ones, and it is the class you
        are reading that tells you which specialisations exist.
      */}
      <ShelfTabs
        shelves={[
          {
            type: 'class',
            items,
            createHref: '/creator/homebrew?type=class',
          },
          {
            type: 'subclass',
            items: subclasses,
            createHref: '/creator/homebrew?type=subclass',
            emptyHint:
              'The SRD keeps its subclasses inside the class entries, so this shelf holds the ones you forge.',
          },
        ]}
      />
    </PageShell>
  );
}
