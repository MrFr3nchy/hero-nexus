/**
 * The standard 5e slot progressions, keyed by caster type.
 *
 * SRD classes carry their slot table inside Open5e's flat
 * `data_for_class_table` rows, which `srd/parse.ts` reassembles. A homebrew
 * author has no such table and should not be made to fill a 20×9 grid by hand
 * — in practice a homebrew class is a full, half, third or pact caster, and
 * the progression follows from that. Choosing the caster type fills the table;
 * an author who genuinely wants a bespoke one can still edit `spellSlots`
 * directly, since nothing here is enforced on save.
 */
import type { ClassData } from './schemas';

type SlotRow = readonly number[];

/** `BY_LEVEL[characterLevel - 1]` = slots at spell levels 1..9. */
const FULL: readonly SlotRow[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Paladin / Ranger: nothing at level 1. */
const HALF: readonly SlotRow[] = [
  [],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

/** Eldritch Knight / Arcane Trickster: nothing until level 3. */
const THIRD: readonly SlotRow[] = [
  [],
  [],
  [2],
  [3],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
];

/**
 * Warlock. Unlike the others the *slot level* climbs and the count stays low,
 * so each row is a single slot level with a count rather than a spread.
 */
const PACT: readonly { slotLevel: number; count: number }[] = [
  { slotLevel: 1, count: 1 },
  { slotLevel: 1, count: 2 },
  { slotLevel: 2, count: 2 },
  { slotLevel: 2, count: 2 },
  { slotLevel: 3, count: 2 },
  { slotLevel: 3, count: 2 },
  { slotLevel: 4, count: 2 },
  { slotLevel: 4, count: 2 },
  { slotLevel: 5, count: 2 },
  { slotLevel: 5, count: 2 },
  { slotLevel: 5, count: 3 },
  { slotLevel: 5, count: 3 },
  { slotLevel: 5, count: 3 },
  { slotLevel: 5, count: 3 },
  { slotLevel: 5, count: 3 },
  { slotLevel: 5, count: 3 },
  { slotLevel: 5, count: 4 },
  { slotLevel: 5, count: 4 },
  { slotLevel: 5, count: 4 },
  { slotLevel: 5, count: 4 },
];

type SpellSlots = ClassData['spellSlots'];

/** Transpose per-character-level rows into `[slotLevel][characterLevel]`. */
function transpose(rows: readonly SlotRow[]): SpellSlots {
  const out: SpellSlots = {};
  rows.forEach((row, index) => {
    const characterLevel = index + 1;
    row.forEach((count, slotIndex) => {
      if (count <= 0) return;
      const slotLevel = String(slotIndex + 1);
      out[slotLevel] ??= {};
      out[slotLevel][String(characterLevel)] = count;
    });
  });
  return out;
}

const TABLES: Record<ClassData['casterType'], SpellSlots> = {
  NONE: {},
  FULL: transpose(FULL),
  HALF: transpose(HALF),
  THIRD: transpose(THIRD),
  PACT: PACT.reduce<SpellSlots>((out, row, index) => {
    const slotLevel = String(row.slotLevel);
    out[slotLevel] ??= {};
    out[slotLevel][String(index + 1)] = row.count;
    return out;
  }, {}),
};

/** The standard slot table for a caster type. Returns a fresh object. */
export function standardSpellSlots(
  casterType: ClassData['casterType']
): SpellSlots {
  return structuredClone(TABLES[casterType]);
}
