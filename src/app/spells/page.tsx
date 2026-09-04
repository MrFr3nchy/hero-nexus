import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { getReference } from '@/server/reference';

export const dynamic = 'force-dynamic';

export default async function SpellsPage() {
  const spells = await getReference('spell');
  const entries = spells.map(s => ({
    slug: s.slug,
    name: s.name,
    data: s.data as Record<string, unknown>,
  }));

  const cantrips = entries.filter(e => e.data.level === 0).length;
  const rituals = entries.filter(e => e.data.ritual).length;

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
      <ReferenceBrowser variant="spell" entries={entries} />
    </PageShell>
  );
}
