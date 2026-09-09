import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { listShelfContent } from '@/server/content';
import { isForged, type ItemData } from '@/@shared/content';

export const dynamic = 'force-dynamic';

export default async function ItemsPage() {
  // Three Open5e categories — magic items, weapons, armour — land on one
  // shelf, because `item` is one content type everywhere else in the app: one
  // forge form, one stat block, one thing a character can carry.
  const items = await listShelfContent('item');
  const data = (i: (typeof items)[number]) => i.entry.data as ItemData;

  const uncommon = items.filter(i => data(i).rarity !== 'common').length;
  const attuned = items.filter(i => data(i).requires_attunement).length;
  const forged = items.filter(isForged).length;

  return (
    <PageShell width="wide">
      {/* Collection archetype: the shelf is the page — see the note on
          /spells. */}
      <PageHeader
        rule={false}
        title="Items"
        description="The SRD 5.2 gear and everything you have forged, searchable."
      />
      {items.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: items.length, label: 'items' },
              { value: uncommon, label: 'beyond common' },
              { value: attuned, label: 'wanting attunement' },
              ...(forged > 0 ? [{ value: forged, label: 'forged' }] : []),
            ]}
          />
          <Marginalia dash className="mb-5">
            the loot, and the three attunement slots it has to fight over
          </Marginalia>
        </>
      )}
      <ReferenceBrowser
        type="item"
        items={items}
        createHref="/creator/homebrew?type=item"
      />
    </PageShell>
  );
}
