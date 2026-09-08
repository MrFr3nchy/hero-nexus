import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { listSrdContent } from '@/server/content';

export const dynamic = 'force-dynamic';

export default async function SpellsPage() {
  const entries = await listSrdContent('spell');
  const data = (e: (typeof entries)[number]) =>
    e.data as { level?: number; ritual?: boolean };
  const cantrips = entries.filter(e => data(e).level === 0).length;
  const rituals = entries.filter(e => data(e).ritual).length;

  return (
    <PageShell width="wide">
      {/* Collection archetype: the compendium is the page, so no rule under
          the title and no card wrapped around the browser — the shelf is the
          object, not something sitting on a panel. */}
      <PageHeader
        rule={false}
        title="Spells"
        description="The SRD 5.2 spell list, synced from Open5e and searchable."
      />
      {entries.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: entries.length, label: 'spells' },
              { value: cantrips, label: 'cantrips' },
              { value: rituals, label: 'rituals' },
            ]}
          />
          <Marginalia dash className="mb-5">
            the ones your DM will make you look up mid-turn
          </Marginalia>
        </>
      )}
      <ReferenceBrowser type="spell" entries={entries} />
    </PageShell>
  );
}
