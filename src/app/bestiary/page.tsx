import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { listShelfContent } from '@/server/content';
import { isForged, type CreatureData } from '@/@shared/content';

export const dynamic = 'force-dynamic';

export default async function BestiaryPage() {
  const items = await listShelfContent('creature');
  const data = (i: (typeof items)[number]) => i.entry.data as CreatureData;

  // Two counts a DM actually uses when picking a fight: what is safe to throw
  // at a first-level party, and what is not a fight at all.
  const lowLevel = items.filter(i => data(i).challenge_rating <= 1).length;
  const legendary = items.filter(
    i => data(i).legendary_actions.length > 0
  ).length;
  const forged = items.filter(isForged).length;

  return (
    <PageShell width="wide">
      {/* Collection archetype: the bestiary is the page — no rule under the
          title, no card around the browser. */}
      <PageHeader
        rule={false}
        title="Bestiary"
        description="The SRD 5.2 monsters and everything you have forged, searchable."
      />
      {items.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: items.length, label: 'creatures' },
              { value: lowLevel, label: 'CR 1 and under' },
              { value: legendary, label: 'legendary' },
              ...(forged > 0 ? [{ value: forged, label: 'forged' }] : []),
            ]}
          />
          <Marginalia dash className="mb-5">
            everything with a stat block and an opinion about your party
          </Marginalia>
        </>
      )}
      <ReferenceBrowser
        type="creature"
        items={items}
        createHref="/creator/homebrew?type=creature"
      />
    </PageShell>
  );
}
