import 'server-only';

import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { CharacterSheet } from '@/@creator/character/schema';
import {
  critToneOf,
  rollNotation,
  type NotationRoll,
} from '@/@shared/lib/dice';
import { db } from '@/db';
import { campaignMembers, campaignRolls, characters } from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';
import { requireUserId } from './session-user';

/**
 * Heroic Inspiration (improvements 10).
 *
 * One at a time, on the sheet as a flag. The DM grants it; the holder spends
 * it on a reroll of a d20 test they just made — the server rolls the d20
 * again and writes a second log row, so the record shows both faces — or
 * hands it to another player, which 2024 allows and which is also what
 * happens when the DM tries to inspire somebody already inspired.
 */

async function seated(campaignId: string, characterId: string) {
  const member = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId),
      eq(campaignMembers.status, 'active')
    ),
  });
  if (!member) throw new Error('NOT_AT_TABLE');
  const row = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!row) throw new Error('NOT_FOUND');
  return { member, row, sheet: row.sheet as CharacterSheet };
}

async function setFlag(
  row: typeof characters.$inferSelect,
  sheet: CharacterSheet,
  value: boolean
): Promise<void> {
  await db
    .update(characters)
    .set({
      sheet: {
        ...sheet,
        combat: { ...sheet.combat, heroicInspiration: value },
      },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(characters.id, row.id));
}

/** The DM hands it over. Refused with `ALREADY_INSPIRED` for a holder. */
export async function grantInspiration(
  campaignId: string,
  characterId: string
): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const { row, sheet } = await seated(campaignId, characterId);
  if (sheet.combat.heroicInspiration) throw new Error('ALREADY_INSPIRED');
  await setFlag(row, sheet, true);
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'vitals',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    characterId,
    characterName: row.name,
    state: 'inspired',
  });
}

/** Take it back. Staff only, no announcement: a correction, not a moment. */
export async function revokeInspiration(
  campaignId: string,
  characterId: string
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const { row, sheet } = await seated(campaignId, characterId);
  if (!sheet.combat.heroicInspiration) return;
  await setFlag(row, sheet, false);
  bumpVersion(campaignId);
}

/**
 * Pass it on. The holder's player, or staff. The receiver must not already
 * hold one — there is only ever one per hero.
 */
export async function passInspiration(
  campaignId: string,
  fromCharacterId: string,
  toCharacterId: string
): Promise<void> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const userId = await requireUserId();
  const isStaff = role === 'gm' || role === 'co-gm';
  if (fromCharacterId === toCharacterId) throw new Error('SAME_HERO');
  const from = await seated(campaignId, fromCharacterId);
  if (!isStaff && from.member.userId !== userId) throw new Error('FORBIDDEN');
  if (!from.sheet.combat.heroicInspiration) throw new Error('NOT_INSPIRED');
  const to = await seated(campaignId, toCharacterId);
  if (to.sheet.combat.heroicInspiration) throw new Error('ALREADY_INSPIRED');
  await setFlag(from.row, from.sheet, false);
  await setFlag(to.row, to.sheet, true);
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'gift',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    fromName: from.row.name,
    toName: to.row.name,
    what: 'Heroic Inspiration',
  });
}

/**
 * Spend it: roll the d20 again. The roll must be the holder's own, made
 * with a d20, and the newest thing they rolled — inspiration rerolls the
 * test in front of you, not one from an hour ago. The second row is
 * labelled so the log shows both faces; the flag clears whatever the die
 * says, because that is the rule.
 */
export async function rerollWithInspiration(
  campaignId: string,
  rollId: string
): Promise<NotationRoll> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const userId = await requireUserId();
  const isStaff = role === 'gm' || role === 'co-gm';

  const roll = await db.query.campaignRolls.findFirst({
    where: and(
      eq(campaignRolls.id, rollId),
      eq(campaignRolls.campaignId, campaignId)
    ),
  });
  if (!roll || !roll.characterId) throw new Error('NOT_FOUND');
  if (!/d20(?!\d)/i.test(roll.notation)) throw new Error('NOT_A_D20');
  if (/Heroic Inspiration/.test(roll.label))
    throw new Error('ALREADY_REROLLED');

  const { member, row, sheet } = await seated(campaignId, roll.characterId);
  if (!isStaff && member.userId !== userId) throw new Error('FORBIDDEN');
  if (!sheet.combat.heroicInspiration) throw new Error('NOT_INSPIRED');

  const result = rollNotation(roll.notation);
  if (!result) throw new Error('BAD_NOTATION');
  const label =
    `${roll.label ? `${roll.label} ` : ''}(Heroic Inspiration)`.slice(0, 80);

  await setFlag(row, sheet, false);
  await db.insert(campaignRolls).values({
    campaignId,
    actorUserId: userId,
    characterId: roll.characterId,
    actorName: roll.actorName,
    label,
    notation: result.notation.slice(0, 60),
    dice: result.dice,
    dropped: result.dropped,
    modifier: result.modifier,
    total: result.total,
    visibility: roll.visibility,
    physical: false,
  });
  bumpVersion(campaignId);

  const secret = roll.visibility === 'dm';
  publish(
    campaignId,
    {
      kind: 'roll',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName: roll.actorName,
      label,
      notation: result.notation,
      total: result.total,
      tone: critToneOf(result.notation, result.dice, result.dropped) ?? 'plain',
      secret,
    },
    secret ? 'staff' : 'everyone'
  );
  return result;
}
