/**
 * Concentration, tested when it should be (improvements 07).
 *
 * `initiative_entries.concentrating` used to be a flag nothing read. Now
 * every damaging write — the tracker's HP box, `attack`, a spell — comes
 * through `concentrationAfterDamage`: a seated hero is asked for the
 * Constitution save through the Asking at DC max(10, half the damage), with
 * the spell's name on the line and a payload `answerCheck` reads to drop the
 * spell on a fail; a foe rolls it here, behind the screen, off its block. At
 * 0 hit points nothing is rolled — the spell simply drops.
 *
 * `breakConcentration` itself lives in `effects.ts`, because dropping a spell
 * is mostly dropping the effect rows it put on the table.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
  concentrationDc,
  spellNameFromKey,
} from '@/@creator/campaign/lib/casting';
import { abilityModifier, savingThrow } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import {
  parseContentData,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import { rollDie } from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  campaignMembers,
  campaignRolls,
  characters,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { requestCheckFrom } from './checks';
import { resolveContentRefs } from './content';
import { breakConcentration } from './effects';
import { publish } from './live-hub';

/**
 * Damage landed on somebody. If they were holding a spell, ask — or roll —
 * the save. `who` names the entry, or the character whose entry in the
 * active fight is looked up; nothing happens for a character in no fight.
 */
export async function concentrationAfterDamage(
  campaignId: string,
  who: { entryId: string } | { characterId: string },
  damage: number,
  down: boolean
): Promise<void> {
  const entry =
    'entryId' in who
      ? await db.query.initiativeEntries.findFirst({
          where: eq(initiativeEntries.id, who.entryId),
        })
      : await entryOfCharacter(campaignId, who.characterId);
  if (!entry || !entry.concentrating) return;

  if (down || damage <= 0) {
    if (down) await breakConcentration(entry.id, null);
    return;
  }

  const dc = concentrationDc(damage);
  const spellName = spellNameFromKey(entry.concentrationSpell);

  if (entry.characterId) {
    const seat = await db.query.campaignMembers.findFirst({
      columns: { userId: true },
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.characterId, entry.characterId),
        eq(campaignMembers.status, 'active')
      ),
    });
    if (seat) {
      await requestCheckFrom(
        campaignId,
        { userId: seat.userId, characterId: null },
        {
          kind: 'save',
          ability: 'constitution',
          dc,
          dcVisibility: 'shown',
          prompt: `Concentration · ${spellName}`,
          targetUserIds: [seat.userId],
          payload: { kind: 'concentration', entryId: entry.id, spellName },
        }
      );
      return;
    }
  }

  // Nobody behind the seat: rolled here, behind the screen.
  const modifier = await conSaveBonus(entry);
  const die = rollDie(20);
  const total = die + modifier;
  await db.insert(campaignRolls).values({
    campaignId,
    actorUserId: null,
    characterId: entry.characterId,
    actorName: entry.label,
    label: `Constitution save · concentration on ${spellName}`.slice(0, 80),
    notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
    dice: [die],
    dropped: [] as number[],
    modifier,
    total,
    visibility: 'dm',
  });
  publish(
    campaignId,
    {
      kind: 'roll',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: null,
      actorName: entry.label,
      label: `concentration on ${spellName} · DC ${dc}`,
      notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
      total,
      tone: die === 20 ? 'crit' : die === 1 ? 'fumble' : 'plain',
      secret: true,
    },
    'staff'
  );
  if (total < dc) await breakConcentration(entry.id, null);
}

async function entryOfCharacter(campaignId: string, characterId: string) {
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { id: true },
    where: and(
      eq(initiativeEncounters.campaignId, campaignId),
      eq(initiativeEncounters.isActive, true)
    ),
  });
  if (!enc) return null;
  return db.query.initiativeEntries.findFirst({
    where: and(
      eq(initiativeEntries.encounterId, enc.id),
      eq(initiativeEntries.characterId, characterId)
    ),
  });
}

async function conSaveBonus(
  entry: typeof initiativeEntries.$inferSelect
): Promise<number> {
  if (entry.characterId) {
    const c = await db.query.characters.findFirst({
      columns: { sheet: true },
      where: eq(characters.id, entry.characterId),
    });
    if (c) return savingThrow(c.sheet as CharacterSheet, 'constitution');
  }
  if (!entry.creatureRef) return 0;
  const resolved = await resolveContentRefs([entry.creatureRef as ContentRef]);
  const block = [...resolved.values()][0];
  if (!block) return 0;
  const d = parseContentData('creature', block.data) as CreatureData;
  return (
    d.saving_throws.constitution ??
    abilityModifier(d.ability_scores.constitution ?? 10)
  );
}
