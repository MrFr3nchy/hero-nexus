/**
 * Turn a guided build into sheet values.
 *
 * `composeSheet` is a pure recompute: given the choices in `sheet.build` and
 * the SRD rows they point at, it rewrites the fields those choices own —
 * abilities, saves, skills, hit points, proficiencies, spell slots, feature
 * text, starting gear. Anything the player edited by hand is listed in
 * `build.overrides` and is left exactly as they left it.
 *
 * Running it after every change is what keeps a class swap from leaving a
 * Wizard's spell slots on a Barbarian.
 */

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILL_KEYS,
  SKILL_LABELS,
  type AbilityKey,
  type CharacterSheet,
  type SkillKey,
} from '../schema';
import { abilityModifier } from './derive';
import { planLevels, slotsAtLevel } from './advancement';
import type { BackgroundDef, ClassDef, SpeciesDef } from './srd/types';

export interface BuildRefs {
  classDef: ClassDef | null;
  species: SpeciesDef | null;
  background: BackgroundDef | null;
}

const isAbilityKey = (value: string): value is AbilityKey =>
  (ABILITY_KEYS as readonly string[]).includes(value);
const isSkillKey = (value: string): value is SkillKey =>
  (SKILL_KEYS as readonly string[]).includes(value);

/** Which sheet fields the guided build owns. Used by the sheet view's badges. */
export const COMPOSED_PATHS = [
  'identity.class',
  'identity.subclass',
  'identity.species',
  'identity.background',
  'identity.size',
  'combat.speed',
  'combat.armorClass',
  'combat.hitPointsMax',
  'combat.hitDiceMax',
  'combat.hitDieSize',
  'proficiencies.armor',
  'proficiencies.weapons',
  'proficiencies.tools',
  'details.classFeatures',
  'details.speciesTraits',
  'details.feats',
  'equipment.items',
] as const;

/**
 * Final ability scores: the generated base, plus the background increase,
 * plus every Ability Score Improvement taken on the way up. Capped at 20,
 * which is where the 2024 rules stop an ASI.
 */
export function finalAbilities(
  sheet: CharacterSheet
): Record<AbilityKey, number> {
  const build = sheet.build;
  const out = { ...build.baseAbilities } as Record<AbilityKey, number>;

  const bump = (key: string, by: number) => {
    if (isAbilityKey(key)) out[key] = Math.min(20, out[key] + by);
  };

  const boost = build.backgroundBoost;
  if (boost.mode === 'two-one') {
    bump(boost.plusTwo, 2);
    boost.plusOnes.slice(0, 1).forEach(k => bump(k, 1));
  } else {
    boost.plusOnes.slice(0, 3).forEach(k => bump(k, 1));
  }

  for (const entry of build.levels) {
    if (!entry.asi || entry.asi.mode !== 'ability') continue;
    bump(entry.asi.plusTwo, 2);
    entry.asi.plusOnes.slice(0, entry.asi.plusTwo ? 1 : 2).forEach(k => bump(k, 1));
  }

  return out;
}

/** Skills the build grants, and where each one came from. */
export function grantedSkills(
  sheet: CharacterSheet,
  refs: BuildRefs
): Map<SkillKey, string> {
  const out = new Map<SkillKey, string>();
  for (const key of refs.background?.skills ?? []) {
    out.set(key, refs.background?.name ?? 'Background');
  }
  for (const key of sheet.build.classSkills) {
    if (isSkillKey(key)) out.set(key, sheet.build.className || 'Class');
  }
  for (const key of sheet.build.bonusSkills) {
    if (isSkillKey(key)) out.set(key, sheet.build.speciesName || 'Species');
  }
  return out;
}

/**
 * Species that change the hit-point maximum directly. Only the Dwarf does in
 * the 2024 SRD, but it is read out of the trait text rather than hard-coded to
 * a name so a reskinned species with the same trait still works.
 */
function speciesHpPerLevel(species: SpeciesDef | null): number {
  const trait = species?.traits.find(t =>
    /hit point maximum increases by 1/i.test(t.desc)
  );
  return trait ? 1 : 0;
}

function hitPointsMax(sheet: CharacterSheet, refs: BuildRefs): number {
  const conMod = abilityModifier(finalAbilities(sheet).constitution);
  const perLevel = speciesHpPerLevel(refs.species);
  return sheet.build.levels.reduce((total, entry) => {
    // A level never grants fewer than 1 hit point, however bad the roll or
    // however negative the Constitution modifier.
    return total + Math.max(1, entry.hpGain + conMod) + perLevel;
  }, 0);
}

/** The ability a caster class uses, taken from its primary abilities. */
export function spellcastingAbility(def: ClassDef | null): AbilityKey | '' {
  if (!def || def.casterType === 'NONE') return '';
  const mental: AbilityKey[] = ['intelligence', 'wisdom', 'charisma'];
  return def.coreTraits.primaryAbilities.find(a => mental.includes(a)) ?? '';
}

function featureText(sheet: CharacterSheet, def: ClassDef | null): string {
  if (!def) return '';
  const steps = planLevels(def, sheet.identity.level, sheet.build.subclassKey);
  const lines: string[] = [];
  for (const step of steps) {
    for (const grant of step.grants) {
      const suffix = grant.detail ? ` (${grant.detail})` : '';
      const origin = grant.source === 'subclass' ? ` [${sheet.build.subclassName}]` : '';
      lines.push(`Level ${step.level} — ${grant.name}${suffix}${origin}`);
    }
  }
  return lines.join('\n');
}

function traitText(sheet: CharacterSheet, species: SpeciesDef | null): string {
  if (!species) return '';
  const chosen = new Map(sheet.build.speciesChoices.map(c => [c.trait, c]));
  return species.traits
    .map(trait => {
      const pick = chosen.get(trait.name);
      return pick?.option
        ? `${trait.name}: ${pick.option}${pick.detail ? ` — ${pick.detail}` : ''}`
        : trait.name;
    })
    .join('\n');
}

function featText(sheet: CharacterSheet, refs: BuildRefs): string {
  const names: string[] = [];
  if (refs.background?.feat) {
    names.push(`${refs.background.feat} (${refs.background.name} background)`);
  }
  for (const entry of sheet.build.levels) {
    if (entry.asi?.mode === 'feat' && entry.asi.featName) {
      names.push(`${entry.asi.featName} (level ${entry.level})`);
    }
  }
  return names.join('\n');
}

function equipmentText(sheet: CharacterSheet, refs: BuildRefs): string {
  const parts: string[] = [];
  const fromClass = refs.classDef?.coreTraits.equipment.find(
    e => e.label === sheet.build.equipment.classOption
  );
  const fromBackground = refs.background?.equipment.find(
    e => e.label === sheet.build.equipment.backgroundOption
  );
  if (fromClass) parts.push(`${sheet.build.className}: ${fromClass.desc}`);
  if (fromBackground) {
    parts.push(`${refs.background?.name}: ${fromBackground.desc}`);
  }
  return parts.join('\n');
}

function startingGold(sheet: CharacterSheet, refs: BuildRefs): number {
  const fromClass = refs.classDef?.coreTraits.equipment.find(
    e => e.label === sheet.build.equipment.classOption
  );
  const fromBackground = refs.background?.equipment.find(
    e => e.label === sheet.build.equipment.backgroundOption
  );
  return (fromClass?.gp ?? 0) + (fromBackground?.gp ?? 0);
}

function toolText(sheet: CharacterSheet, refs: BuildRefs): string {
  return [refs.classDef?.coreTraits.tools, refs.background?.tool]
    .filter(Boolean)
    .join('; ');
}

/**
 * Recompute every field the build owns. Returns a new sheet; the input is
 * untouched. `mode: 'manual'` builds are returned unchanged, so a hand-written
 * sheet never has values rewritten under it.
 */
export function composeSheet(
  sheet: CharacterSheet,
  refs: BuildRefs
): CharacterSheet {
  const build = sheet.build;
  if (build.mode !== 'guided') return sheet;

  const owned = new Set(build.overrides);
  const keep = <T>(path: string, next: T, current: T): T =>
    owned.has(path) ? current : next;

  const abilities = finalAbilities(sheet);
  const saves = refs.classDef?.coreTraits.savingThrows ?? [];
  const skills = grantedSkills(sheet, refs);
  const dexMod = abilityModifier(abilities.dexterity);
  const level = sheet.identity.level;

  const slots = slotsAtLevel(refs.classDef, level);
  const nextSlots = { ...sheet.spellcasting.slots };
  for (let i = 1; i <= 9; i++) {
    const slotKey = `level${i}` as keyof CharacterSheet['spellcasting']['slots'];
    const total = slots[i] ?? 0;
    nextSlots[slotKey] = {
      total,
      expended: Math.min(sheet.spellcasting.slots[slotKey].expended, total),
    };
  }

  return {
    ...sheet,
    identity: {
      ...sheet.identity,
      class: keep('identity.class', build.className, sheet.identity.class),
      subclass: keep(
        'identity.subclass',
        build.subclassName,
        sheet.identity.subclass
      ),
      species: keep('identity.species', build.speciesName, sheet.identity.species),
      background: keep(
        'identity.background',
        build.backgroundName,
        sheet.identity.background
      ),
      size: sheet.identity.size,
    },
    abilities: Object.fromEntries(
      ABILITY_KEYS.map(key => [
        key,
        { score: abilities[key], proficientSave: saves.includes(key) },
      ])
    ) as CharacterSheet['abilities'],
    skills: Object.fromEntries(
      SKILL_KEYS.map(key => [key, skills.has(key)])
    ) as CharacterSheet['skills'],
    combat: {
      ...sheet.combat,
      speed: keep('combat.speed', refs.species?.speed ?? 30, sheet.combat.speed),
      armorClass: keep('combat.armorClass', 10 + dexMod, sheet.combat.armorClass),
      hitDieSize: refs.classDef?.hitDie ?? sheet.combat.hitDieSize,
      hitDiceMax: level,
      hitPointsMax: keep(
        'combat.hitPointsMax',
        hitPointsMax(sheet, refs),
        sheet.combat.hitPointsMax
      ),
      hitPointsCurrent: sheet.combat.hitPointsCurrent,
    },
    proficiencies: {
      ...sheet.proficiencies,
      armor: keep(
        'proficiencies.armor',
        refs.classDef?.coreTraits.armor ?? '',
        sheet.proficiencies.armor
      ),
      weapons: keep(
        'proficiencies.weapons',
        refs.classDef?.coreTraits.weapons ?? '',
        sheet.proficiencies.weapons
      ),
      tools: keep('proficiencies.tools', toolText(sheet, refs), sheet.proficiencies.tools),
    },
    spellcasting: {
      ability: spellcastingAbility(refs.classDef),
      slots: nextSlots,
    },
    details: {
      ...sheet.details,
      classFeatures: keep(
        'details.classFeatures',
        featureText(sheet, refs.classDef),
        sheet.details.classFeatures
      ),
      speciesTraits: keep(
        'details.speciesTraits',
        traitText(sheet, refs.species),
        sheet.details.speciesTraits
      ),
      feats: keep('details.feats', featText(sheet, refs), sheet.details.feats),
    },
    equipment: {
      ...sheet.equipment,
      items: keep('equipment.items', equipmentText(sheet, refs), sheet.equipment.items),
    },
    currency: {
      ...sheet.currency,
      gp: keep('currency.gp', startingGold(sheet, refs), sheet.currency.gp),
    },
  };
}

/** Human-readable summary of what the build granted, for the change log. */
export function describeGrants(sheet: CharacterSheet, refs: BuildRefs): string[] {
  const lines: string[] = [];
  const saves = refs.classDef?.coreTraits.savingThrows ?? [];
  if (saves.length) {
    lines.push(
      `Saving throw proficiency: ${saves.map(s => ABILITY_LABELS[s]).join(' and ')}`
    );
  }
  const skills = grantedSkills(sheet, refs);
  for (const [skill, source] of skills) {
    lines.push(`Skill proficiency: ${SKILL_LABELS[skill]} (${source})`);
  }
  return lines;
}
