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

export default async function SpeciesPage() {
  const items = await listShelfContent('species');
  const data = (i: (typeof items)[number]) =>
    i.entry.data as { speed?: number; traits?: unknown[] };
  const forged = items.filter(isForged).length;
  const fleet = items.filter(i => (data(i).speed ?? 30) > 30).length;

  return (
    <PageShell width="wide">
      {/* Collection archetype — see the note on /spells. */}
      <PageHeader
        rule={false}
        title="Species"
        description="The SRD 5.2 species and everything you have forged."
      />
      {items.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: items.length, label: 'species' },
              { value: fleet, label: 'faster than 30 ft' },
              ...(forged > 0 ? [{ value: forged, label: 'forged' }] : []),
            ]}
          />
          <Marginalia dash className="mb-5">
            what you are, before anyone asks what you do
          </Marginalia>
        </>
      )}
      <ReferenceBrowser
        type="species"
        items={items}
        createHref="/creator/homebrew?type=species"
      />
    </PageShell>
  );
}
