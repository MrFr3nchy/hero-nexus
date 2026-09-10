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

export default async function BackgroundsPage() {
  const items = await listShelfContent('background');
  const data = (i: (typeof items)[number]) => i.entry.data as { feat?: string };
  const forged = items.filter(isForged).length;
  const feats = new Set(
    items.map(i => data(i).feat?.trim()).filter((f): f is string => Boolean(f))
  ).size;

  return (
    <PageShell width="wide">
      {/* Collection archetype — see the note on /spells. */}
      <PageHeader
        rule={false}
        title="Backgrounds"
        description="The SRD 5.2 backgrounds and everything you have forged."
      />
      {items.length > 0 && (
        <>
          <Ledger
            className="mb-1"
            items={[
              { value: items.length, label: 'backgrounds' },
              { value: feats, label: 'origin feats between them' },
              ...(forged > 0 ? [{ value: forged, label: 'forged' }] : []),
            ]}
          />
          <Marginalia dash className="mb-5">
            the part of the sheet that decides how the tavern treats you
          </Marginalia>
        </>
      )}
      <ReferenceBrowser
        type="background"
        items={items}
        createHref="/creator/homebrew?type=background"
      />
    </PageShell>
  );
}
