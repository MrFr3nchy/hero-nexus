/**
 * D&D Beyond character import (7b) — the pure half.
 *
 * There is no official D&D Beyond API. The JSON a player can save from the
 * unofficial character service (`character/v5/character/<id>`, public
 * characters only) is pasted or uploaded by the player; **the server never
 * calls D&D Beyond.** That keeps Hero Nexus off an endpoint with unclear
 * terms, adds no outbound call, and keeps working if the endpoint moves.
 *
 * D&D Beyond characters are mostly 2014 rules and this app is 2024 only, so
 * this is deliberately **not a conversion**. It carries over the facts that
 * mean the same thing in both — name, class and level, ability scores as
 * final numbers, hit points, the names of items and spells, the written
 * notes — and the character is created as a draft for the player to finish
 * in the builder. Species, background and where the bonuses came from are
 * left to the wizard, because in 2024 the background grants them.
 *
 * Every read is defensive: the shape is unofficial and changes. A field that
 * is missing or the wrong type is skipped, never thrown on.
 *
 * Pure: no React, no server, no database. Tests in `ddb-import.test.ts`,
 * against `test/fixtures/ddb/*.json`.
 */
import type { AbilityKey, CharacterSheet } from '../schema';

/** D&D Beyond numbers its abilities 1–6 in this order. */
const ABILITY_BY_ID: Record<number, AbilityKey> = {
  1: 'strength',
  2: 'dexterity',
  3: 'constitution',
  4: 'intelligence',
  5: 'wisdom',
  6: 'charisma',
};

const ALIGNMENTS: Record<number, string> = {
  1: 'Lawful Good',
  2: 'Neutral Good',
  3: 'Chaotic Good',
  4: 'Lawful Neutral',
  5: 'Neutral',
  6: 'Chaotic Neutral',
  7: 'Lawful Evil',
  8: 'Neutral Evil',
  9: 'Chaotic Evil',
};

export interface DdbClass {
  name: string;
  subclass: string;
  level: number;
  hitDie: number;
}

export interface DdbItem {
  name: string;
  quantity: number;
  equipped: boolean;
}

export interface DdbSpell {
  name: string;
  level: number | null;
  prepared: boolean;
}

/** What the import keeps, before anything is matched to content. */
export interface DdbFacts {
  name: string;
  classes: DdbClass[];
  level: number;
  species: string;
  background: string;
  alignment: string;
  xp: number;
  abilities: Record<AbilityKey, number>;
  hitPointsMax: number | null;
  items: DdbItem[];
  spells: DdbSpell[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  notes: {
    backstory: string;
    personality: string;
    appearance: string;
    other: string;
  };
  /** What did not carry over, in words, for the preview. */
  warnings: string[];
}

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 200): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function statList(v: unknown): Map<AbilityKey, number> {
  const out = new Map<AbilityKey, number>();
  for (const s of arr(v)) {
    const id = num(obj(s).id);
    const value = num(obj(s).value);
    const key = id !== null ? ABILITY_BY_ID[id] : undefined;
    if (key && value !== null) out.set(key, value);
  }
  return out;
}

/**
 * Every `bonus` modifier to an ability score, from every source D&D Beyond
 * files them under (species, class, background, feat, item). A `set`
 * modifier — a Belt of Giant Strength — is an item's effect, not the score,
 * and is left to the item.
 */
function scoreBonuses(modifiers: unknown): Map<AbilityKey, number> {
  const out = new Map<AbilityKey, number>();
  for (const group of Object.values(obj(modifiers))) {
    for (const m of arr(group)) {
      const mod = obj(m);
      if (mod.type !== 'bonus') continue;
      const sub = str(mod.subType);
      const ability = sub.endsWith('-score')
        ? (sub.slice(0, -'-score'.length) as AbilityKey)
        : null;
      const value = num(mod.value) ?? num(mod.fixedValue);
      if (!ability || value === null) continue;
      if (!Object.values(ABILITY_BY_ID).includes(ability)) continue;
      out.set(ability, (out.get(ability) ?? 0) + value);
    }
  }
  return out;
}

/** Read a character, from the service's `{ data: … }` wrapper or bare. */
export function parseDdbCharacter(input: unknown): DdbFacts | null {
  const root = obj(input);
  const data =
    root.data && typeof root.data === 'object' ? obj(root.data) : root;
  const name = str(data.name, 80);
  if (!name && !Array.isArray(data.classes) && !Array.isArray(data.stats)) {
    return null;
  }
  const warnings: string[] = [];

  const classes: DdbClass[] = arr(data.classes)
    .map(c => {
      const cl = obj(c);
      const def = obj(cl.definition);
      return {
        name: str(def.name, 60),
        subclass: str(obj(cl.subclassDefinition).name, 60),
        level: Math.max(1, Math.min(20, Math.trunc(num(cl.level) ?? 1))),
        hitDie: num(def.hitDice) ?? 8,
        starting: cl.isStartingClass === true,
      };
    })
    .filter(c => c.name)
    // The starting class first: it is the one the builder is asked to pick.
    .sort(
      (a, b) => Number(b.starting) - Number(a.starting) || b.level - a.level
    )
    .map(({ starting: _starting, ...c }) => c);
  const level = Math.max(
    1,
    Math.min(20, classes.reduce((n, c) => n + c.level, 0) || 1)
  );
  if (classes.length > 1) {
    warnings.push(
      `Multiclassed (${classes.map(c => `${c.name} ${c.level}`).join(' / ')}): imported as ${classes[0].name} at level ${level}. Check the builder.`
    );
  }

  const base = statList(data.stats);
  const bonus = statList(data.bonusStats);
  const override = statList(data.overrideStats);
  const fromModifiers = scoreBonuses(data.modifiers);
  const abilities = {} as Record<AbilityKey, number>;
  for (const key of Object.values(ABILITY_BY_ID)) {
    const total =
      override.get(key) ??
      (base.get(key) ?? 10) +
        (bonus.get(key) ?? 0) +
        (fromModifiers.get(key) ?? 0);
    abilities[key] = Math.max(1, Math.min(30, Math.trunc(total)));
  }

  const conMod = Math.floor((abilities.constitution - 10) / 2);
  const baseHp = num(data.baseHitPoints);
  const hitPointsMax =
    num(data.overrideHitPoints) ??
    (baseHp !== null
      ? Math.max(1, baseHp + (num(data.bonusHitPoints) ?? 0) + conMod * level)
      : null);

  const items: DdbItem[] = arr(data.inventory)
    .map(i => {
      const it = obj(i);
      return {
        name: str(obj(it.definition).name, 160),
        quantity: Math.max(1, Math.trunc(num(it.quantity) ?? 1)),
        equipped: it.equipped === true,
      };
    })
    .filter(i => i.name)
    .slice(0, 200);

  // Spells live in two places: each class's list, and the spells granted by
  // species, feats and items. One list here, by name.
  const spellRows: unknown[] = [
    ...arr(data.classSpells).flatMap(c => arr(obj(c).spells)),
    ...Object.values(obj(data.spells)).flatMap(arr),
  ];
  const seen = new Set<string>();
  const spells: DdbSpell[] = [];
  for (const s of spellRows) {
    const sp = obj(s);
    const def = obj(sp.definition);
    const spellName = str(def.name, 120);
    if (!spellName || seen.has(spellName.toLowerCase())) continue;
    seen.add(spellName.toLowerCase());
    spells.push({
      name: spellName,
      level: num(def.level),
      prepared: sp.prepared === true || sp.alwaysPrepared === true,
    });
  }

  const cur = obj(data.currencies);
  const coin = (k: string) => Math.max(0, Math.trunc(num(cur[k]) ?? 0));

  const notes = obj(data.notes);
  const traits = obj(data.traits);
  const personality = [
    traits.personalityTraits,
    traits.ideals,
    traits.bonds,
    traits.flaws,
  ]
    .map(t => str(t, 2000))
    .filter(Boolean)
    .join('\n\n');
  const other = [
    ['Allies', notes.allies],
    ['Organizations', notes.organizations],
    ['Enemies', notes.enemies],
    ['Possessions', notes.personalPossessions],
    ['Other holdings', notes.otherHoldings],
    ['Notes', notes.otherNotes],
  ]
    .map(([label, v]) => {
      const text = str(v, 2000);
      return text ? `${label}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  const species =
    str(obj(data.race).fullName, 80) || str(obj(data.race).baseName, 80);
  const background = str(obj(obj(data.background).definition).name, 80);
  warnings.push(
    'D&D Beyond is mostly 2014 rules. Species, background and where your ability bonuses come from are for the builder to settle under the 2024 rules.'
  );

  return {
    name: name || 'Imported hero',
    classes,
    level,
    species,
    background,
    alignment: ALIGNMENTS[num(data.alignmentId) ?? 0] ?? '',
    xp: Math.max(0, Math.trunc(num(data.currentXp) ?? 0)),
    abilities,
    hitPointsMax,
    items,
    spells,
    currency: {
      cp: coin('cp'),
      sp: coin('sp'),
      ep: coin('ep'),
      gp: coin('gp'),
      pp: coin('pp'),
    },
    notes: {
      backstory: str(notes.backstory, 4000),
      personality,
      appearance: str(traits.appearance, 2000),
      other,
    },
    warnings,
  };
}

/** How content names are compared: case, apostrophes and punctuation ignored. */
export function matchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The name without a parenthetical: "Bag of Tricks (Rust)" → "bag of tricks". */
export function baseKey(name: string): string {
  return matchKey(name.replace(/\s*\(.*?\)\s*/g, ' '));
}

/**
 * A name lookup over content: the exact name first; failing that, the plain
 * base name — but only onto content that has no parenthetical of its own, so
 * "Dagger" never lands on "Dagger (+1)".
 */
export function nameIndex<T extends { name: string }>(
  entries: readonly T[]
): (name: string) => T | null {
  const exact = new Map<string, T>();
  const plain = new Map<string, T>();
  for (const e of entries) {
    const k = matchKey(e.name);
    if (!exact.has(k)) exact.set(k, e);
    if (!/\(/.test(e.name) && !plain.has(k)) plain.set(k, e);
  }
  return name => exact.get(matchKey(name)) ?? plain.get(baseKey(name)) ?? null;
}

/** A content match: the SRD row an imported name was found as. */
export interface ImportRef {
  source: 'srd' | 'homebrew';
  type: 'item' | 'spell';
  key: string;
  name: string;
}

/** Note on an inventory row that came in by name only. */
export const NEEDS_A_MATCH = 'Imported from D&D Beyond — needs a match';

/**
 * The draft sheet: the facts on an empty 2024 sheet, items and spells as
 * references where a name matched (content-model rule 1) and by name only
 * where it did not. A spell cannot be on the spell list without a reference,
 * so an unmatched one is written into the class features for the player to
 * resolve. Never creates homebrew: most unmatched content is from paid books,
 * and the homebrew market is public.
 */
export function buildImportedSheet(
  facts: DdbFacts,
  itemRefs: (ImportRef | null)[],
  spellRefs: (ImportRef | null)[],
  makeId: () => string,
  empty: () => CharacterSheet
): CharacterSheet {
  const sheet = empty();
  const main = facts.classes[0];
  sheet.identity = {
    ...sheet.identity,
    name: facts.name,
    class: main?.name ?? '',
    subclass: main?.subclass ?? '',
    species: facts.species,
    background: facts.background,
    alignment: facts.alignment,
    level: facts.level,
    xp: facts.xp,
  };
  for (const key of Object.keys(facts.abilities) as AbilityKey[]) {
    sheet.abilities[key].score = facts.abilities[key];
  }
  if (facts.hitPointsMax !== null) {
    sheet.combat.hitPointsMax = facts.hitPointsMax;
    sheet.combat.hitPointsCurrent = facts.hitPointsMax;
  }
  sheet.combat.hitDiceMax = facts.level;
  if (main && [6, 8, 10, 12].includes(main.hitDie)) {
    sheet.combat.hitDieSize = main.hitDie;
  }
  sheet.inventory = facts.items.map((item, i) => {
    const ref = itemRefs[i] ?? null;
    return {
      id: makeId(),
      ref,
      name: ref?.name ?? item.name,
      quantity: Math.min(9999, item.quantity),
      equipped: item.equipped,
      attuned: false,
      notes: ref ? '' : NEEDS_A_MATCH,
      grantedBy: '',
    };
  });
  const unmatchedSpells: string[] = [];
  sheet.spellcasting.spells = facts.spells.flatMap((spell, i) => {
    const ref = spellRefs[i];
    if (!ref) {
      unmatchedSpells.push(spell.name);
      return [];
    }
    return [
      { ref, prepared: spell.prepared, alwaysPrepared: false, notes: '' },
    ];
  });
  sheet.currency = { ...facts.currency };
  sheet.details = {
    ...sheet.details,
    backstory: [facts.notes.backstory, facts.notes.other]
      .filter(Boolean)
      .join('\n\n'),
    personality: facts.notes.personality,
    appearance: facts.notes.appearance,
    classFeatures: unmatchedSpells.length
      ? `Spells from D&D Beyond that need a match: ${unmatchedSpells.join(', ')}.`
      : '',
  };
  return sheet;
}
