/**
 * Hit points landing on a combatant, with no gate on it.
 *
 * The arithmetic of `applyHp` — temp HP first, the floor at 0, the ceiling,
 * a seated hero through the play patch so going down announces and death
 * saves start, a worn shape taking the hit first (07), concentration tested
 * after (07) — for every caller that has already decided who may: the
 * tracker's staff box, `attack` and `applyDamage` (06), a spell landing, a
 * trap firing (08). Its own module so `session.ts`, `fight.ts`, `casting.ts`
 * and `battlemap.ts` can all reach it without importing each other.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { damageForm, type EntryForm } from '@/@creator/campaign/lib/casting';
import { db } from '@/db';
import { characters, encounterEffects, initiativeEntries } from '@/db/schema';
import { concentrationAfterDamage } from './concentration';
import { bumpVersion, publish } from './live-hub';
import { applyPlayPatchUnchecked } from './play';

export async function applyHpUnchecked(
  entryId: string,
  campaignId: string,
  delta: number
): Promise<void> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  if (entry.hpCurrent == null) return;

  /*
   * A seated character's hit points live on the sheet, and the tracker row
   * is a mirror of it. Writing the row alone left the DM's tracker saying 0
   * while the player's card said 4, announced nothing when somebody went
   * down, and started no death saves — so a party entry goes through the
   * play patch, which writes the sheet, mirrors the row, and tells the table.
   * The row-only path below is for foes, and for a character whose seat has
   * since gone (the patch refuses it, and the row is all there is).
   */
  if (entry.characterId) {
    // Unchecked on purpose: every caller has decided who may already — the
    // staff gate in `applyHp`, the rules in `attack` and `applyDamage`, the
    // consent behind a spell. A seat that has since gone falls through to
    // the row, which is all there is.
    const character = await db.query.characters.findFirst({
      where: eq(characters.id, entry.characterId),
    });
    if (character) {
      await applyPlayPatchUnchecked(character, campaignId, {
        hpCurrentDelta: delta,
      });
      return;
    }
  }

  // A shape worn for now takes the hit first (07); at 0 it drops, and the
  // excess is carried or lost by the form's own rule.
  let remaining = delta;
  if (delta < 0 && entry.form) {
    const worn = entry.form as EntryForm;
    const after = damageForm(worn, -delta);
    await db
      .update(initiativeEntries)
      .set({ form: after.form })
      .where(eq(initiativeEntries.id, entryId));
    if (after.form === null) {
      // The row that timed the shape goes with it.
      if (worn.effectId) {
        await db
          .delete(encounterEffects)
          .where(eq(encounterEffects.id, worn.effectId));
      }
      publish(campaignId, {
        kind: 'effect',
        id: randomUUID(),
        at: new Date().toISOString(),
        what: 'ended',
        label: `${worn.label} form`,
        targets: [entry.label],
        duration: '',
        secret: false,
      });
    }
    remaining = -after.carried;
    if (remaining === 0) {
      bumpVersion(campaignId);
      return;
    }
  }
  const dmg = remaining;

  if (dmg < 0) {
    const damage = -dmg;
    const fromTemp = Math.min(entry.hpTemp, damage);
    const rest = damage - fromTemp;
    const hpAfter = Math.max(0, entry.hpCurrent - rest);
    await db
      .update(initiativeEntries)
      .set({
        hpTemp: entry.hpTemp - fromTemp,
        hpCurrent: hpAfter,
      })
      .where(eq(initiativeEntries.id, entryId));
    bumpVersion(campaignId);
    // A foe holding a spell rolls its Constitution save behind the screen.
    await concentrationAfterDamage(
      campaignId,
      { entryId },
      damage,
      hpAfter <= 0
    );
    return;
  }

  const ceiling = entry.hpMax ?? entry.hpCurrent + dmg;
  await db
    .update(initiativeEntries)
    .set({ hpCurrent: Math.min(ceiling, entry.hpCurrent + dmg) })
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(campaignId);
}
