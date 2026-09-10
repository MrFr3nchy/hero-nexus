/**
 * Weapons: proficiency, mastery, and what an attack with one comes to.
 *
 * Everything here is pure and takes plain data, so the character sheet, the
 * compendium and the DM's screen can each ask the same question and get the
 * same answer. Nothing in this file touches React, the database, or a sheet
 * type — `character/lib/derive.ts` is what joins it to a character.
 *
 * The reason it exists at all: weapon proficiency was prose. A class granted
 * `"Simple weapons and Martial weapons that have the Finesse or Light
 * property"` as a 62-character string, and a weapon carried `is_simple: true`
 * as a boolean, and nothing could put the two together — so no attack bonus on
 * any sheet could say whether the proficiency bonus applied.
 */

/**
 * The eight 2024 weapon masteries.
 *
 * Open5e already tags these: a weapon's `properties[]` carries entries shaped
 * `{ property: { name, type, desc }, detail }`, and the mastery is the one
 * with `type: "Mastery"`. It was being flattened to a bare name alongside
 * "Versatile" and "Heavy", which made the edition's signature martial mechanic
 * indistinguishable from a note about grip.
 */
export const WEAPON_MASTERIES = [
  'Cleave',
  'Graze',
  'Nick',
  'Push',
  'Sap',
  'Slow',
  'Topple',
  'Vex',
] as const;

export type WeaponMastery = (typeof WEAPON_MASTERIES)[number];

export function isWeaponMastery(value: string): value is WeaponMastery {
  return (WEAPON_MASTERIES as readonly string[]).includes(value);
}

/**
 * What a character is proficient with.
 *
 * `martialProperties` is the part a boolean pair cannot express and the reason
 * this is a struct rather than two flags. Three of the 2024 classes grant
 * martial weapons *conditionally* — the Rogue gets "Martial weapons that have
 * the Finesse or Light property", the Monk the Light ones — and a model that
 * cannot say so either hands a Rogue a greataxe or takes their rapier away.
 * Empty means every martial weapon, which is what Fighter and Barbarian get.
 */
export interface WeaponProficiency {
  simple: boolean;
  martial: boolean;
  /** Martial weapons qualify only if they carry one of these properties. */
  martialProperties: string[];
  /** Specific weapons by name, lowercased — species and feat grants. */
  names: string[];
}

export const NO_WEAPON_PROFICIENCY: WeaponProficiency = {
  simple: false,
  martial: false,
  martialProperties: [],
  names: [],
};

/** The weapon facts a proficiency check and an attack line both need. */
export interface WeaponFacts {
  name: string;
  damageDice: string;
  damageType: string | null;
  /** 0 for a melee weapon. */
  range: number;
  longRange: number;
  isSimple: boolean;
  /** Every property name, mastery included. */
  properties: string[];
  mastery: WeaponMastery | null;
  /** Two-handed damage for a Versatile weapon, e.g. "1d10". */
  versatileDice: string;
}

const lower = (values: string[]) => values.map(v => v.toLowerCase());

/** Whether a weapon carries a named property, case-insensitively. */
export function hasProperty(weapon: WeaponFacts, property: string): boolean {
  return lower(weapon.properties).includes(property.toLowerCase());
}

/**
 * Whether a character proficient in `prof` is proficient with `weapon`.
 *
 * A specific grant wins over every category rule, because that is how species
 * and feats are worded — an Elf's longsword proficiency is not an argument
 * about whether longswords are martial.
 */
export function isProficientWith(
  prof: WeaponProficiency,
  weapon: WeaponFacts
): boolean {
  if (lower(prof.names).includes(weapon.name.toLowerCase())) return true;
  if (weapon.isSimple) return prof.simple;
  if (!prof.martial) return false;
  if (prof.martialProperties.length === 0) return true;
  return prof.martialProperties.some(p => hasProperty(weapon, p));
}

/**
 * Turn a class's prose proficiency line into the struct.
 *
 * Open5e ships this as a table cell, and every 2024 class writes it one of
 * three ways: "Simple weapons", "Simple and Martial weapons", or "Simple
 * weapons and Martial weapons that have the X or Y property". This reads all
 * three and degrades to "nothing recognised" rather than guessing, which is
 * the same bargain `.catch()` makes everywhere else in the content schemas —
 * a line it cannot read costs the proficiency, never the whole class.
 *
 * A homebrew author never goes through here: content-model rule 3 says the
 * identity types mirror the *parsed* shape, so a form fills the struct.
 */
export function parseWeaponProficiency(prose: string): WeaponProficiency {
  const text = prose.toLowerCase();
  if (!text.trim()) return { ...NO_WEAPON_PROFICIENCY };

  const simple = /\bsimple\b/.test(text);
  const martial = /\bmartial\b/.test(text);

  // "…Martial weapons that have the Finesse or Light property" — read only the
  // clause after "martial", so a sentence that qualifies simple weapons
  // instead cannot silently narrow the martial grant.
  const martialProperties: string[] = [];
  const clause = text.split(/\bmartial\b/)[1] ?? '';
  const qualifier = clause.match(/that ha(?:ve|s) the ([^.]*?)propert/);
  if (qualifier) {
    for (const word of qualifier[1].split(/,|\bor\b|\band\b/)) {
      const trimmed = word.trim();
      if (trimmed) martialProperties.push(capitalise(trimmed));
    }
  }

  return { simple, martial, martialProperties, names: [] };
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Merge grants from several sources — class, species, feats. */
export function mergeWeaponProficiency(
  ...parts: WeaponProficiency[]
): WeaponProficiency {
  const out: WeaponProficiency = { ...NO_WEAPON_PROFICIENCY, names: [] };
  for (const part of parts) {
    out.simple = out.simple || part.simple;
    // An unconditional martial grant absorbs a conditional one: being handed
    // every martial weapon by the Fighter level does not un-hand the Light
    // ones the Monk level gave. Losing this makes multiclassing subtract.
    if (part.martial) {
      if (out.martial && out.martialProperties.length === 0) {
        // already unconditional, nothing to add
      } else if (part.martialProperties.length === 0) {
        out.martial = true;
        out.martialProperties = [];
      } else {
        out.martial = true;
        out.martialProperties = [
          ...new Set([...out.martialProperties, ...part.martialProperties]),
        ];
      }
    }
    out.names = [...new Set([...out.names, ...part.names])];
  }
  return out;
}
