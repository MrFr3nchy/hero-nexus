import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getCharacterAction } from '@/@creator/character/actions';
import {
  NothingToRun,
  PlaySurface,
} from '@/@creator/character/components/PlaySurface';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';
import { weaponAttacks } from '@/@creator/character/lib/derive';
import { characterTable } from '@/server/characters';
import { resolveContentRefs } from '@/server/content';
import { getPlayLoadout, getPlayState } from '@/server/play';

export const dynamic = 'force-dynamic';

/**
 * Running a character, with or without a table.
 *
 * A sibling route rather than a mode on `/characters/[id]`, because that page
 * is a server-rendered read with no client state on purpose — making it
 * editable would drag the whole sheet into the browser on the one page whose
 * job is reading. See `docs/handoff/the-long-campaign/README.md`.
 */
export default async function CharacterPlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // `getCharacter` is owner-only, so this is the gate: a hero you do not own
  // is not one you get to run. The DM's route into the same numbers is the
  // campaign screen, which authorises through membership instead.
  const character = await getCharacterAction(id);
  if (!character) notFound();

  const campaign = await characterTable(id);
  // Throws rather than returning null, but `getCharacter` above already
  // established ownership, so `authorize` cannot refuse this one.
  const state = await getPlayState(id, campaign?.campaignId ?? null);
  const loadout = await getPlayLoadout(id, campaign?.campaignId ?? null);
  const attacks = weaponAttacks(
    character.sheet,
    await resolveContentRefs(
      character.sheet.inventory
        .map(i => i.ref)
        .filter((r): r is NonNullable<typeof r> => r !== null)
    )
  );

  return (
    <ProtectedRoute>
      <PageShell>
        <Link
          href={`/characters/${id}`}
          className="mb-2 inline-block text-sm text-ink-muted hover:text-ink"
        >
          ← {character.name || 'Character'}
        </Link>
        {/* rule={false}: the page leads with the object, not the title. */}
        <PageHeader
          rule={false}
          title="At the table"
          description="Hit points, hit dice, death saves and spell slots — everything that moves between one roll and the next."
        />
        {state.hpMax > 0 ? (
          <PlaySurface
            initial={state}
            campaign={campaign}
            attacks={attacks}
            loadout={loadout}
          />
        ) : (
          <NothingToRun characterId={id} />
        )}
      </PageShell>
    </ProtectedRoute>
  );
}
