/**
 * What the guided build still needs before the character is finished.
 *
 * Each issue names the step that fixes it, so the wizard's step rail can show
 * where the gaps are without duplicating any of this logic.
 */

import type { AbilityMethod, CharacterSheet } from '../schema';
import { speciesSkillGrant } from './srd/parse';
import type { BuildRefs } from './compose';
import { planLevels } from './advancement';

export type StepId =
  | 'class'
  | 'species'
  | 'background'
  | 'abilities'
  | 'skills'
  | 'advancement'
  | 'equipment'
  | 'details'
  | 'review';

export interface BuildIssue {
  step: StepId;
  message: string;
}

/**
 * What a campaign's table rules narrow the builder down to. The builder hides
 * whatever these forbid, so the only ones that can still turn into an issue
 * are the rules a saved sheet can break on its own — a level or a generation
 * method chosen before the table was picked, and a missing backstory.
 */
export interface BuildLimits {
  /** Highest level a character may be built to. */
  maxLevel: number;
  /** Ability-score methods the table permits. Empty = all of them. */
  allowedMethods: AbilityMethod[];
  /** Species names (case-insensitive) the table disallows. */
  bannedSpecies: string[];
  /** Class names (case-insensitive) the table disallows. */
  bannedClasses: string[];
  allowHomebrew: boolean;
  requireBackstory: boolean;
}

/** No table picked: everything the SRD offers is on the menu. */
export const OPEN_LIMITS: BuildLimits = {
  maxLevel: 20,
  allowedMethods: [],
  bannedSpecies: [],
  bannedClasses: [],
  allowHomebrew: true,
  requireBackstory: false,
};

const METHOD_LABEL: Record<AbilityMethod, string> = {
  pointbuy: 'point buy',
  standard: 'the standard array',
  roll: 'rolled scores',
  manual: 'typed-in scores',
};

export function findBuildIssues(
  sheet: CharacterSheet,
  refs: BuildRefs,
  limits: BuildLimits = OPEN_LIMITS
): BuildIssue[] {
  const build = sheet.build;
  const issues: BuildIssue[] = [];
  const add = (step: StepId, message: string) => issues.push({ step, message });

  const norm = (s: string) => s.trim().toLowerCase();
  const bannedClass = new Set(limits.bannedClasses.map(norm));
  const bannedSpecies = new Set(limits.bannedSpecies.map(norm));

  if (!sheet.identity.name.trim()) add('details', 'Your hero needs a name.');
  if (!build.className) add('class', 'No class chosen.');
  else if (bannedClass.has(norm(build.className))) {
    add('class', `${build.className} is not allowed at this table.`);
  }
  if (!build.speciesName) add('species', 'No species chosen.');
  else if (bannedSpecies.has(norm(build.speciesName))) {
    add('species', `${build.speciesName} is not allowed at this table.`);
  }
  if (!build.backgroundName) add('background', 'No background chosen.');

  // Homebrew written before a no-homebrew table was picked.
  if (!limits.allowHomebrew) {
    if (!build.classKey && build.className) {
      add('class', 'This table does not allow a homebrew class.');
    }
    if (!build.speciesKey && build.speciesName) {
      add('species', 'This table does not allow a homebrew species.');
    }
    if (!build.backgroundKey && build.backgroundName) {
      add('background', 'This table does not allow a homebrew background.');
    }
    if (sheet.homebrew.isHomebrew || sheet.homebrew.entries.length > 0) {
      add('details', 'This table does not allow homebrew content.');
    }
  }

  /* ---- abilities ---- */
  // Standard array and rolled sets leave unplaced abilities at 1.
  const placing =
    sheet.generation.abilityMethod === 'standard' ||
    sheet.generation.abilityMethod === 'roll';
  if (placing) {
    const blank = Object.values(build.baseAbilities).filter(v => v <= 1).length;
    if (blank > 0) {
      add(
        'abilities',
        `${blank} ability score${blank === 1 ? '' : 's'} still to place.`
      );
    }
  }

  if (limits.requireBackstory && !sheet.details.backstory.trim()) {
    add('details', 'This table requires a backstory.');
  }

  if (
    limits.allowedMethods.length > 0 &&
    !limits.allowedMethods.includes(sheet.generation.abilityMethod)
  ) {
    add(
      'abilities',
      `This table does not allow ${METHOD_LABEL[sheet.generation.abilityMethod]} — pick another method.`
    );
  }

  const boost = build.backgroundBoost;
  if (refs.background) {
    const done =
      boost.mode === 'three'
        ? boost.plusOnes.length === 3
        : Boolean(boost.plusTwo) && boost.plusOnes.length === 1;
    if (!done) {
      add('background', "Your background's ability increase is unassigned.");
    }
  }

  /* ---- skills ---- */
  const classChoice = refs.classDef?.coreTraits.skillChoice;
  if (classChoice && build.classSkills.length < classChoice.count) {
    add(
      'skills',
      `Choose ${classChoice.count - build.classSkills.length} more class skill${
        classChoice.count - build.classSkills.length === 1 ? '' : 's'
      }.`
    );
  }
  const speciesChoice = refs.species ? speciesSkillGrant(refs.species) : null;
  if (speciesChoice && build.bonusSkills.length < speciesChoice.count) {
    add('skills', `${refs.species?.name} grants a skill you haven't picked.`);
  }

  /* ---- species trait choices ---- */
  for (const trait of refs.species?.traits ?? []) {
    if (trait.options.length === 0) continue;
    const picked = build.speciesChoices.find(c => c.trait === trait.name);
    if (!picked?.option) add('species', `${trait.name} needs a choice.`);
  }

  /* ---- advancement ---- */
  if (sheet.identity.level > limits.maxLevel) {
    add(
      'advancement',
      `This table starts characters at level ${limits.maxLevel} or below.`
    );
  }
  const steps = planLevels(
    refs.classDef,
    sheet.identity.level,
    build.subclassKey
  );
  for (const step of steps) {
    const entry = build.levels.find(l => l.level === step.level);
    if (step.needsSubclass && !entry?.subclassKey) {
      add('advancement', `Level ${step.level}: choose a subclass.`);
    }
    if (step.needsAsi) {
      const asi = entry?.asi;
      const done = asi
        ? asi.mode === 'feat'
          ? Boolean(asi.featName)
          : Boolean(asi.plusTwo) || asi.plusOnes.length === 2
        : false;
      if (!done) {
        add(
          'advancement',
          `Level ${step.level}: spend the Ability Score Improvement.`
        );
      }
    }
  }

  /* ---- equipment ---- */
  if (
    (refs.classDef?.coreTraits.equipment.length ?? 0) > 0 &&
    !build.equipment.classOption
  ) {
    add('equipment', 'Pick your class equipment package.');
  }
  if (
    (refs.background?.equipment.length ?? 0) > 0 &&
    !build.equipment.backgroundOption
  ) {
    add('equipment', 'Pick your background equipment package.');
  }

  return issues;
}
