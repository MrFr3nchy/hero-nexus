import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  critToneOf,
  parseNotation,
  rollNotation,
  type NotationRoll,
} from '@/@shared/lib/dice';
import { db } from '@/db';
import { campaignRolls, characters, users } from '@/db/schema';
import { requireCampaignRole } from '../campaigns';

import { bumpVersion, publish, type Audience } from '../live-hub';
import { claimedFaces } from '../dice-claims';
import { staff } from './encounter';

/**
 * The shared roll log.
 */
export interface RollInput {
  notation: string;
  label?: string;
  characterId?: string | null;
  visibility?: 'table' | 'dm';
  /**
   * Faces read off real dice, one per die the notation asks for. The
   * server checks them against the notation and does the sum; the table's
   * `physicalDice` rule says whether a player may send them at all.
   */
  faces?: number[];
}

/**
 * Roll dice for the table. Any member may roll; only staff may roll privately,
 * because a player hiding a roll from the DM is not a feature.
 *
 * The dice are rolled here rather than in the browser, so the log records what
 * the dice did instead of what a client said they did.
 */
export async function rollForCampaign(
  campaignId: string,
  input: RollInput
): Promise<NotationRoll> {
  const { role, userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';

  if (!parseNotation(input.notation)) throw new Error('BAD_NOTATION');
  const faces = await claimedFaces(campaignId, isStaff, input.faces);
  const result = rollNotation(input.notation, faces);
  if (!result) throw new Error('BAD_FACES');
  const physical = faces !== undefined;

  let actorName = '';
  let characterId = input.characterId ?? null;

  if (characterId) {
    const character = await db.query.characters.findFirst({
      where: eq(characters.id, characterId),
    });
    // A character someone else owns is not yours to roll as.
    if (!character || character.ownerId !== userId) {
      if (!isStaff) throw new Error('NOT_YOUR_CHARACTER');
      characterId = character ? characterId : null;
    }
    actorName = character?.name ?? '';
  }

  if (!actorName) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    actorName = user?.name || (isStaff ? 'The DM' : 'A player');
  }

  const secret = isStaff && (input.visibility ?? 'table') === 'dm';
  await recordRoll(campaignId, {
    actorUserId: userId,
    characterId,
    actorName,
    label: input.label ?? '',
    result,
    secret,
    physical,
    /*
     * The announcement. A roll behind the screen publishes to staff and to
     * nobody else — the audience is the whole of the secrecy decision, so it
     * sits beside the `visibility` that decided it rather than three files
     * away.
     */
    audience: secret ? 'staff' : 'everyone',
  });

  // Handed back so the roller can animate the faces the server actually
  // rolled. The log is still the record; this is only what to draw.
  return result;
}

/**
 * One row in Dice, its bump, and its announcement — every roll the server
 * makes ends here, so a roll from the sheet, a tavern game's cup and a typed
 * `1d20` are one kind of row.
 *
 * `secret` writes `visibility = 'dm'`: the row is read by staff and by
 * whoever rolled it (`getLiveState`), never by the rest of the table. Only
 * server modules choose it for a player — a tavern game's cheat — because
 * `rollForCampaign` keeps a player's own input to the table.
 *
 * `audience: null` writes the row without a slip: a tavern game's cups come
 * up together and the game announces the lift once, rather than five dice
 * slips burying it.
 */
export async function recordRoll(
  campaignId: string,
  roll: {
    actorUserId: string | null;
    characterId: string | null;
    actorName: string;
    label: string;
    result: NotationRoll;
    secret: boolean;
    physical?: boolean;
    audience: Audience | null;
  }
): Promise<void> {
  const label = roll.label.trim().slice(0, 80);
  await db.insert(campaignRolls).values({
    campaignId,
    actorUserId: roll.actorUserId,
    characterId: roll.characterId,
    actorName: roll.actorName,
    label,
    notation: roll.result.notation.slice(0, 60),
    dice: roll.result.dice,
    dropped: roll.result.dropped,
    modifier: roll.result.modifier,
    total: roll.result.total,
    visibility: roll.secret ? 'dm' : 'table',
    physical: roll.physical ?? false,
  });

  bumpVersion(campaignId);
  if (!roll.audience) return;

  publish(
    campaignId,
    {
      kind: 'roll',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: roll.actorUserId,
      actorName: roll.actorName,
      label,
      notation: roll.result.notation,
      total: roll.result.total,
      tone:
        critToneOf(
          roll.result.notation,
          roll.result.dice,
          roll.result.dropped
        ) ?? 'plain',
      secret: roll.secret,
      physical: roll.physical ?? false,
    },
    roll.audience
  );
}

/** Clear the log. Staff only — it is the table's record, not one player's. */
export async function clearRolls(campaignId: string): Promise<void> {
  await staff(campaignId);
  await db
    .delete(campaignRolls)
    .where(eq(campaignRolls.campaignId, campaignId));
  bumpVersion(campaignId);
}
