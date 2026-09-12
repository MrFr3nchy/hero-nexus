import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { listShelfContent } from '@/server/content';
import { type RuleData } from '@/@shared/content';

export const dynamic = 'force-dynamic';

export default async function HouseRulesPage() {
  const items = await listShelfContent('rule');
  const data = (i: (typeof items)[number]) => i.entry.data as RuleData;

  // The SRD prints no house rules, so every row here is somebody's: yours,
  // or one you adopted from the Library.
  const mine = items.filter(i => i.origin === 'mine').length;
  const replacing = items.filter(i => Boolean(data(i).replaces.trim())).length;

  return (
    <PageShell width="wide">
      {/* Collection archetype — see the note on /spells. */}
      <PageHeader
        rule={false}
        title="House rules"
        description="The rules your tables play by that the book does not print — yours, and the ones you have adopted."
      />
      {items.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: items.length, label: 'house rules' },
              { value: mine, label: 'of your own' },
              { value: replacing, label: 'replacing a printed rule' },
            ]}
          />
          <Marginalia dash className="mb-5">
            the argument from last session, written down
          </Marginalia>
        </>
      )}
      <ReferenceBrowser
        type="rule"
        items={items}
        createHref="/creator/homebrew?type=rule"
        emptyHint="Nothing is printed here — a house rule is always somebody's. Forge one, approve it into a table's library, and it appears in that table's Rules at hand."
      />
    </PageShell>
  );
}
