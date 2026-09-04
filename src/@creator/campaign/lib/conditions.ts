/**
 * The D&D 5e 2024 conditions, as a fixed vocabulary.
 *
 * A free-text conditions field is what a DM ends up ignoring: it cannot be
 * counted down, cannot be coloured, and "prone" / "Prone" / "on the floor" are
 * three different values. These keys are what the tracker stores in
 * `initiative_entries.condition_keys`; the free-text `conditions` column stays
 * beside them for the half of what a table means that no list covers.
 *
 * Pure data — no React, no DB. Safe on both sides of the wire.
 */

export const CONDITION_KEYS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;

export type ConditionKey = (typeof CONDITION_KEYS)[number];

export interface ConditionDef {
  key: ConditionKey;
  label: string;
  /** One line, the part a DM needs mid-turn. */
  hint: string;
  /** How bad it is to be under, for the chip colour. */
  tone: 'warning' | 'danger';
}

export const CONDITIONS: ConditionDef[] = [
  {
    key: 'blinded',
    label: 'Blinded',
    hint: 'Fails sight checks. Attacks against have advantage; its own have disadvantage.',
    tone: 'warning',
  },
  {
    key: 'charmed',
    label: 'Charmed',
    hint: "Can't attack the charmer; the charmer has advantage on social checks.",
    tone: 'warning',
  },
  {
    key: 'deafened',
    label: 'Deafened',
    hint: 'Fails hearing checks.',
    tone: 'warning',
  },
  {
    key: 'exhaustion',
    label: 'Exhaustion',
    hint: '−2 per level on d20 tests, −5 ft. speed per level. Level 6 is death.',
    tone: 'danger',
  },
  {
    key: 'frightened',
    label: 'Frightened',
    hint: 'Disadvantage while the source is in sight; cannot willingly move closer.',
    tone: 'warning',
  },
  {
    key: 'grappled',
    label: 'Grappled',
    hint: 'Speed 0; disadvantage on attacks against anything but the grappler.',
    tone: 'warning',
  },
  {
    key: 'incapacitated',
    label: 'Incapacitated',
    hint: 'No actions, bonus actions or reactions. Concentration breaks.',
    tone: 'danger',
  },
  {
    key: 'invisible',
    label: 'Invisible',
    hint: 'Attacks against have disadvantage; its own have advantage.',
    tone: 'warning',
  },
  {
    key: 'paralyzed',
    label: 'Paralyzed',
    hint: 'Incapacitated, cannot move or speak, auto-fails STR/DEX saves. Hits within 5 ft. crit.',
    tone: 'danger',
  },
  {
    key: 'petrified',
    label: 'Petrified',
    hint: 'Stone. Incapacitated, resistant to all damage, immune to poison and disease.',
    tone: 'danger',
  },
  {
    key: 'poisoned',
    label: 'Poisoned',
    hint: 'Disadvantage on attack rolls and ability checks.',
    tone: 'warning',
  },
  {
    key: 'prone',
    label: 'Prone',
    hint: 'Crawls at half speed. Melee against has advantage, ranged has disadvantage.',
    tone: 'warning',
  },
  {
    key: 'restrained',
    label: 'Restrained',
    hint: 'Speed 0. Attacks against have advantage; its own have disadvantage; DEX saves too.',
    tone: 'danger',
  },
  {
    key: 'stunned',
    label: 'Stunned',
    hint: 'Incapacitated, auto-fails STR/DEX saves, attacks against have advantage.',
    tone: 'danger',
  },
  {
    key: 'unconscious',
    label: 'Unconscious',
    hint: 'Incapacitated and prone, drops everything, hits within 5 ft. crit.',
    tone: 'danger',
  },
];

const BY_KEY = new Map(CONDITIONS.map(c => [c.key, c]));

export function conditionDef(key: string): ConditionDef | undefined {
  return BY_KEY.get(key as ConditionKey);
}

/** Parse the stored comma-separated column, dropping anything unrecognised. */
export function parseConditions(stored: string): ConditionKey[] {
  return stored
    .split(',')
    .map(s => s.trim())
    .filter((s): s is ConditionKey => BY_KEY.has(s as ConditionKey));
}

/** Serialise back to the column, deduped and in the canonical order. */
export function serializeConditions(keys: string[]): string {
  const set = new Set(keys);
  return CONDITION_KEYS.filter(k => set.has(k)).join(',');
}
