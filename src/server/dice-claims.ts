import 'server-only';

import type { TableRules } from '@/@creator/campaign/lib/table-rules';
import { effectiveRules } from './table-rules';

/**
 * Real dice at the table.
 *
 * The house rule, restated for the one place it bends: the browser never
 * sends a modifier or a total. What it may send is the face it saw on a die
 * — a claim about the die, checked for count and range by the notation it
 * is claimed for — and the server still reads the modifier off the sheet
 * and does the sum. Whether a player may make that claim at all is the
 * table's `physicalDice` rule; staff always may, because a DM rolling
 * behind a real screen is the oldest thing at the table.
 */

/** Whether a caller may hand over faces at this table. */
export function physicalDiceAllowed(
  rules: Pick<TableRules, 'physicalDice'>,
  isStaff: boolean
): boolean {
  return isStaff || rules.physicalDice !== 'off';
}

/**
 * The faces a caller claims, if they may claim any; `undefined` when they
 * sent none, so the caller rolls. Throws `PHYSICAL_DICE_OFF` when the table
 * does not allow it. Whether the faces fit the roll is the roller's check —
 * it knows the notation — and it throws `BAD_FACES` when they do not.
 */
export async function claimedFaces(
  campaignId: string | null,
  isStaff: boolean,
  faces: number[] | undefined
): Promise<number[] | undefined> {
  if (!faces) return undefined;
  // No table, no rule to read: a character at nobody's table is advised on
  // everything else and allowed here too.
  if (!campaignId) return faces;
  const rules = await effectiveRules(campaignId);
  if (!physicalDiceAllowed(rules, isStaff)) throw new Error('PHYSICAL_DICE_OFF');
  return faces;
}
