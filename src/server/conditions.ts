/**
 * Writing conditions down, in both the places they live.
 *
 * The sheet (`combat.conditions`) is the truth for a seated character, and the
 * tracker row (`initiative_entries.condition_keys`) is a mirror of it for the
 * length of one fight; a foe has only the row. Every write goes through here
 * so the two cannot drift — `play.ts` for a player marking their own sheet,
 * `session.ts` for the DM's picker, `effects.ts` when a timed condition lands
 * or runs out. Small on purpose, and imported by all three, which is why it
 * is its own module rather than a corner of any of them.
 */
import 'server-only';

import { and, eq, inArray, isNotNull, notInArray } from 'drizzle-orm';

import {
  parseConditions,
  serializeConditions,
  type ConditionKey,
} from '@/@creator/campaign/lib/conditions';
import type { CharacterSheet } from '@/@creator/character/schema';
import { db } from '@/db';
import { characters, encounterEffects, initiativeEntries } from '@/db/schema';

/**
 * Drop the timed rows behind conditions that are no longer on these entries.
 *
 * A condition with a duration is two facts — the key on the row and the
 * clock in `encounter_effects` — and unticking the key by hand must not
 * leave a clock running for nothing. Called after every write of the keys.
 */
async function pruneConditionRows(
  entryIds: string[],
  keys: readonly ConditionKey[]
): Promise<void> {
  if (entryIds.length === 0) return;
  await db
    .delete(encounterEffects)
    .where(
      and(
        inArray(encounterEffects.entryId, entryIds),
        eq(encounterEffects.kind, 'condition'),
        isNotNull(encounterEffects.conditionKey),
        keys.length > 0
          ? notInArray(encounterEffects.conditionKey, [...keys])
          : undefined
      )
    );
}

/**
 * Set a character's conditions: the sheet, and every tracker row that mirrors
 * it. Returns the cleaned list — parsed through the vocabulary, so a retired
 * key never reaches a chip with no definition for it.
 */
export async function writeConditions(
  characterId: string,
  keys: readonly string[]
): Promise<ConditionKey[]> {
  const cleaned = parseConditions(serializeConditions([...keys]));

  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (character) {
    const sheet = character.sheet as CharacterSheet;
    const next: CharacterSheet = {
      ...sheet,
      combat: { ...sheet.combat, conditions: cleaned },
    };
    await db
      .update(characters)
      .set({ sheet: next, updatedAt: new Date().toISOString() })
      .where(eq(characters.id, characterId));
  }

  const rows = await db
    .update(initiativeEntries)
    .set({ conditionKeys: serializeConditions(cleaned) })
    .where(eq(initiativeEntries.characterId, characterId))
    .returning({ id: initiativeEntries.id });
  await pruneConditionRows(
    rows.map(r => r.id),
    cleaned
  );

  return cleaned;
}

/**
 * Set one tracker row's conditions — and, when the row is a seated
 * character's, the sheet behind it. The route for anything addressed by
 * entry rather than by character: the DM's picker, an effect expiring.
 */
export async function writeEntryConditions(
  entryId: string,
  keys: readonly string[]
): Promise<ConditionKey[]> {
  const entry = await db.query.initiativeEntries.findFirst({
    columns: { id: true, characterId: true },
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) return [];
  if (entry.characterId) return writeConditions(entry.characterId, keys);

  const cleaned = parseConditions(serializeConditions([...keys]));
  await db
    .update(initiativeEntries)
    .set({ conditionKeys: serializeConditions(cleaned) })
    .where(eq(initiativeEntries.id, entryId));
  await pruneConditionRows([entryId], cleaned);
  return cleaned;
}
