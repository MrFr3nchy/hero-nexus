import 'server-only';

import { eq } from 'drizzle-orm';

import { d20PenaltyFor } from '@/@creator/campaign/lib/condition-effects';
import {
  isSheetRoll,
  sheetRollBonus,
  sheetRollLabel,
  sheetRollNotation,
  type SheetRoll,
} from '@/@creator/campaign/lib/sheet-rolls';
import type { CharacterSheet } from '@/@creator/character/schema';
import type { NotationRoll } from '@/@shared/lib/dice';
import { db } from '@/db';
import { characters } from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { rollForCampaign } from './session';

export type SheetRollMode = 'straight' | 'advantage' | 'disadvantage';

/**
 * Roll something off a hero's own sheet, at the table: a skill, a save, an
 * ability, initiative.
 *
 * The browser says *which* roll and how (advantage, real dice); the server
 * reads the bonus off the sheet — the same arithmetic as `bonusFor` in
 * `checks.ts`, exhaustion included — so a DM can trust "Stealth · 17" without
 * asking what was added. The rolling, the log row, the bump and the
 * announcement are `rollForCampaign`'s, so a roll from the sheet is one more
 * line in Dice and never a second kind of roll.
 *
 * Initiative from here is only a roll. It never writes the order: that is the
 * tracker's, and a player re-rolling it mid-fight from the sheet would be a
 * second door into a number the DM owns.
 */
export async function rollFromSheet(
  campaignId: string,
  characterId: string,
  roll: SheetRoll,
  mode: SheetRollMode = 'straight',
  faces?: number[]
): Promise<NotationRoll> {
  const { role, userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  if (!isSheetRoll(roll)) throw new Error('BAD_ROLL');
  if (!['straight', 'advantage', 'disadvantage'].includes(mode)) {
    throw new Error('BAD_ROLL');
  }

  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  // One error for "no such hero" and "not at this table": the second must not
  // tell a player that an id they guessed is a hero somewhere else.
  if (!character || character.campaignId !== campaignId) {
    throw new Error('NOT_AT_TABLE');
  }
  const isStaff = role === 'gm' || role === 'co-gm';
  if (character.ownerId !== userId && !isStaff) {
    throw new Error('NOT_YOUR_CHARACTER');
  }

  const sheet = character.sheet as CharacterSheet;
  const bonus =
    sheetRollBonus(sheet, roll) + d20PenaltyFor(sheet.combat?.exhaustion ?? 0);

  return rollForCampaign(campaignId, {
    notation: sheetRollNotation(bonus, mode),
    label: sheetRollLabel(roll),
    characterId,
    faces,
  });
}
