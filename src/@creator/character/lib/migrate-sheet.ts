/**
 * Bringing sheets written before `inventory` existed up to date.
 *
 * Equipment used to be one free-text box. Turning that into rows has to be
 * lossless in both directions, so:
 *
 * - The prose is **kept**. `equipment.items` still holds exactly what it held;
 *   this only *adds* the structured rows alongside it. Nothing is deleted, and
 *   a mis-split line is a cosmetic annoyance rather than lost gear.
 * - Migration runs on **stored** sheets only, never on an incoming save. A
 *   player who deletes every inventory row and keeps their prose would
 *   otherwise have the rows resurrected on the next read — so the trigger is
 *   `inventory` being *absent*, which only a pre-migration sheet can be. An
 *   empty array means "emptied on purpose" and is left alone.
 *
 * There is no SQL migration for this: sheets are a JSON blob and splitting
 * prose in SQLite would be worse in every way than doing it here, where it can
 * be read and tested.
 */

import { parseWeaponProficiency } from '@/@shared/content/weapons';

import type { InventoryItem } from '../schema';

/** `"2 Handaxes"` -> quantity 2, name "Handaxes". */
function splitQuantity(text: string): { quantity: number; name: string } {
  const match = /^(\d{1,4})\s*[x×]?\s+(.*)$/.exec(text);
  if (!match) return { quantity: 1, name: text };
  const quantity = Number(match[1]);
  const name = match[2].trim();
  // "10 sheets" is a quantity; "5e Handbook" is a name that starts with digits.
  if (!name || quantity < 1) return { quantity: 1, name: text };
  return { quantity, name };
}

/**
 * Split one prose line into item names.
 *
 * `composeSheet` wrote lines as `"Fighter: Chain Mail, Greatsword, 2 Handaxes"`
 * — a source label, then a comma list. The label is dropped from the item
 * names and kept as the row's note, so where the gear came from survives.
 */
function splitLine(
  line: string
): { name: string; note: string; source: string }[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let source = '';
  let body = trimmed;
  const labelled = /^([^:]{1,40}):\s*(.+)$/.exec(trimmed);
  if (labelled) {
    source = labelled[1].trim();
    body = labelled[2].trim();
  }

  return (
    body
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      // The source goes in `grantedBy`, not the note — putting it in both made
      // rows read "from Fighter · From Fighter".
      .map(name => ({ name, note: '', source }))
  );
}

let counter = 0;
function rowId(): string {
  counter += 1;
  return `mig_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** Free-text equipment prose as inventory rows. Exported for testing. */
export function inventoryFromProse(
  items: string,
  magicItems: string
): InventoryItem[] {
  const rows: InventoryItem[] = [];

  const push = (name: string, note: string, magic: boolean, source: string) => {
    const { quantity, name: cleanName } = splitQuantity(name);
    if (!cleanName) return;
    rows.push({
      id: rowId(),
      ref: null,
      name: cleanName.slice(0, 160),
      quantity,
      equipped: false,
      // Attunement is never guessed from prose — a wrong `true` would silently
      // eat one of the character's three slots.
      attuned: false,
      notes: (magic
        ? [note, 'Magic item'].filter(Boolean).join(' · ')
        : note
      ).slice(0, 500),
      grantedBy: source.slice(0, 60),
    });
  };

  for (const line of items.split('\n')) {
    for (const part of splitLine(line)) {
      push(part.name, part.note, false, part.source);
    }
  }
  for (const line of magicItems.split('\n')) {
    for (const part of splitLine(line)) {
      push(part.name, part.note, true, part.source);
    }
  }

  return rows.slice(0, 500);
}

/**
 * The rows one starting-equipment package grants.
 *
 * Shares the prose splitter with the migration because the input is the same
 * shape — Open5e writes a package's contents as `"Chain Mail, Greatsword, 2
 * Handaxes"`, a comma list with no per-item structure to reference.
 */
export function inventoryFromPackage(
  source: string,
  desc: string
): InventoryItem[] {
  return inventoryFromProse(`${source}: ${desc}`, '');
}

/**
 * Replace the rows one source granted, leaving everything else alone.
 *
 * The reason the inventory is not a composed path: a recompute that rebuilt
 * the list would delete every piece of loot the party has found. Swapping a
 * package touches only its own rows.
 */
export function regrantInventory(
  inventory: InventoryItem[],
  source: string,
  granted: InventoryItem[]
): InventoryItem[] {
  return [...inventory.filter(i => i.grantedBy !== source), ...granted];
}

/**
 * A stored sheet, brought forward.
 *
 * Takes and returns raw JSON rather than a parsed `CharacterSheet`, because it
 * has to run *before* validation — the whole point is that the stored shape is
 * older than the schema. Never throws: a sheet it cannot read is returned
 * untouched for `safeParse` to reject in the usual way.
 */
export function migrateStoredSheet(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  let sheet = raw as Record<string, unknown>;
  sheet = migrateInventory(sheet);
  sheet = migrateWeaponProficiency(sheet);
  return sheet;
}

function migrateInventory(sheet: Record<string, unknown>) {
  // Present, even as [], means this sheet has already been through here.
  if (Array.isArray(sheet.inventory)) return sheet;

  const equipment = (sheet.equipment ?? {}) as Record<string, unknown>;
  const items = typeof equipment.items === 'string' ? equipment.items : '';
  const magicItems =
    typeof equipment.magicItems === 'string' ? equipment.magicItems : '';

  return {
    ...sheet,
    inventory: inventoryFromProse(items, magicItems),
  };
}

/**
 * Read the prose proficiency line into the struct, for sheets written before
 * the struct existed.
 *
 * Without this every existing character's attacks would read "not proficient",
 * because `weaponProficiency` defaults to an empty grant and their class's
 * proficiency has only ever been recorded as a sentence.
 *
 * Same bargain as the inventory migration above: additive, lossless, and
 * triggered by the field being *absent*. A sheet that carries an explicitly
 * empty grant has been through here — or has had it deliberately cleared — and
 * is left alone. Parsing on every read instead would make the proficiency
 * bonus appear and disappear as a player edited the sentence.
 */
function migrateWeaponProficiency(sheet: Record<string, unknown>) {
  const prof = sheet.proficiencies;
  if (!prof || typeof prof !== 'object') return sheet;
  const proficiencies = prof as Record<string, unknown>;
  if (proficiencies.weaponProficiency !== undefined) return sheet;

  const prose =
    typeof proficiencies.weapons === 'string' ? proficiencies.weapons : '';

  return {
    ...sheet,
    proficiencies: {
      ...proficiencies,
      weaponProficiency: parseWeaponProficiency(prose),
    },
  };
}
