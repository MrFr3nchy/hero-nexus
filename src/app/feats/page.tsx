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

export default async function FeatsPage() {
  const items = await listShelfContent('feat');
  const data = (i: (typeof items)[number]) =>
    i.entry.data as { category?: string; prerequisite?: string };
  const forged = items.filter(isForged).length;
  const origin = items.filter(i =>
    /origin/i.test(data(i).category ?? '')
  ).length;
  const gated = items.filter(i => Boolean(data(i).prerequisite?.trim())).length;

  return (
    <PageShell width="wide">
      {/* Collection archetype — see the note on /spells. */}
      <PageHeader
        rule={false}
        title="Feats"
        description="The SRD 5.2 feats and everything you have forged."
      />
      {items.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: items.length, label: 'feats' },
              { value: origin, label: 'origin feats' },
              { value: gated, label: 'with prerequisites' },
              ...(forged > 0 ? [{ value: forged, label: 'forged' }] : []),
            ]}
          />
          <Marginalia dash className="mb-5">
            the level-four argument, settled early
          </Marginalia>
        </>
      )}
      <ReferenceBrowser
        type="feat"
        items={items}
        createHref="/creator/homebrew?type=feat"
      />
    </PageShell>
  );
}
