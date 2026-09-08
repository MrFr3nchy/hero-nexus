import { ReferenceBrowser } from '@/@shared/components/ReferenceBrowser';
import {
  Ledger,
  Marginalia,
  PageHeader,
  PageShell,
} from '@/@shared/components/ui';
import { listSrdContent } from '@/server/content';
import type { CreatureData } from '@/@shared/content';

export const dynamic = 'force-dynamic';

export default async function BestiaryPage() {
  const entries = await listSrdContent('creature');
  const data = (e: (typeof entries)[number]) => e.data as CreatureData;

  // Two counts a DM actually uses when picking a fight: what is safe to throw
  // at a first-level party, and what is not a fight at all.
  const lowLevel = entries.filter(e => data(e).challenge_rating <= 1).length;
  const legendary = entries.filter(
    e => data(e).legendary_actions.length > 0
  ).length;

  return (
    <PageShell width="wide">
      {/* Collection archetype: the bestiary is the page — no rule under the
          title, no card around the browser. */}
      <PageHeader
        rule={false}
        title="Bestiary"
        description="The SRD 5.2 monsters, synced from Open5e and searchable."
      />
      {entries.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: entries.length, label: 'creatures' },
              { value: lowLevel, label: 'CR 1 and under' },
              { value: legendary, label: 'legendary' },
            ]}
          />
          <Marginalia dash className="mb-5">
            everything with a stat block and an opinion about your party
          </Marginalia>
        </>
      )}
      <ReferenceBrowser type="creature" entries={entries} />
    </PageShell>
  );
}
