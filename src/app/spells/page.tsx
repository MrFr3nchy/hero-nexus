import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { listShelfContent } from '@/server/content';
import { isForged } from '@/@shared/content';

export const dynamic = 'force-dynamic';

export default async function SpellsPage() {
  const items = await listShelfContent('spell');
  const data = (i: (typeof items)[number]) =>
    i.entry.data as { level?: number; ritual?: boolean };
  const cantrips = items.filter(i => data(i).level === 0).length;
  const rituals = items.filter(i => data(i).ritual).length;
  const forged = items.filter(isForged).length;

  return (
    <PageShell width="wide">
      {/* Collection archetype: the compendium is the page, so no rule under
          the title and no card wrapped around the browser — the shelf is the
          object, not something sitting on a panel. */}
      <PageHeader
        rule={false}
        title="Spells"
        description="The SRD 5.2 spell list and everything you have forged, searchable."
      />
      {items.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: items.length, label: 'spells' },
              { value: cantrips, label: 'cantrips' },
              { value: rituals, label: 'rituals' },
              ...(forged > 0 ? [{ value: forged, label: 'forged' }] : []),
            ]}
          />
          <Marginalia dash className="mb-5">
            the ones your DM will make you look up mid-turn
          </Marginalia>
        </>
      )}
      <ReferenceBrowser
        type="spell"
        items={items}
        createHref="/creator/homebrew?type=spell"
      />
    </PageShell>
  );
}
