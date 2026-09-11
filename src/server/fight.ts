/**
 * What the shelf beside the sand table reaches for.
 *
 * Two reads and nothing else: a character's weapon attacks, priced off the
 * sheet by the same pure `weaponAttacks` the play page uses; and the creature
 * behind an initiative entry, resolved through `resolveContentRefs` so a
 * homebrew monster renders exactly like an SRD one. Neither writes. The rolls
 * they lead to go through `rollForCampaign`, because there is one dice log.
 */
import 'server-only';

import { eq } from 'drizzle-orm';

import {
  weaponAttacks,
  type WeaponAttack,
} from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import type { ContentEntry, ContentRef } from '@/@shared/content';
import { db } from '@/db';
import { characters, initiativeEntries } from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { resolveContentRefs } from './content';
import { requireUserId } from './session-user';

/**
 * The viewer's own weapons in hand at this table.
 *
 * Owner or staff — the same gate `authorize` in play.ts applies — and read
 * fresh each time rather than cached on `LiveState`, because it needs every
 * equipped item's ref resolved and the party panel does not.
 */
export async function getMyAttacks(
  characterId: string,
  campaignId: string
): Promise<WeaponAttack[]> {
  const userId = await requireUserId();
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) throw new Error('NOT_FOUND');
  const isStaff = role === 'gm' || role === 'co-gm';
  if (!isStaff && character.ownerId !== userId) throw new Error('FORBIDDEN');

  const sheet = character.sheet as CharacterSheet;
  const refs = sheet.inventory
    .map(i => i.ref)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return weaponAttacks(sheet, await resolveContentRefs(refs));
}

/**
 * The block behind a combatant. Staff only: a player knows what an aboleth
 * is from its name and does not get its actions off the shelf.
 *
 * Null rather than a throw for a hand-typed foe — "Goblin, AC 15, 7 hp" was
 * never in the bestiary and the shelf says so instead of breaking.
 */
export async function getEntryCreature(
  entryId: string
): Promise<ContentEntry | null> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true },
    where: (t, { eq: e }) => e(t.id, entry.encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  await requireCampaignRole(enc.campaignId, ['gm', 'co-gm']);

  const ref = entry.creatureRef as ContentRef | null;
  if (!ref) return null;
  const resolved = await resolveContentRefs([ref]);
  return [...resolved.values()][0] ?? null;
}

/** The character seated for the viewer at this table, if any. */
export async function mySeat(campaignId: string): Promise<string | null> {
  const userId = await requireUserId();
  const row = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: (t, ops) =>
      ops.and(ops.eq(t.campaignId, campaignId), ops.eq(t.userId, userId)),
  });
  return row?.characterId ?? null;
}
