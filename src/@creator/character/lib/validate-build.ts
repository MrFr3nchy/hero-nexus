/**
 * What the guided build still needs before the character is finished.
 *
 * Each issue names the step that fixes it, so the wizard's step rail can show
 * where the gaps are without duplicating any of this logic.
 */

import type { CharacterSheet } from '../schema';
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

export function findBuildIssues(
  sheet: CharacterSheet,
  refs: BuildRefs
): BuildIssue[] {
  const build = sheet.build;
  const issues: BuildIssue[] = [];
  const add = (step: StepId, message: string) => issues.push({ step, message });

  if (!sheet.identity.name.trim()) add('details', 'Your hero needs a name.');
  if (!build.className) add('class', 'No class chosen.');
  if (!build.speciesName) add('species', 'No species chosen.');
  if (!build.backgroundName) add('background', 'No background chosen.');

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
  const steps = planLevels(refs.classDef, sheet.identity.level, build.subclassKey);
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
        add('advancement', `Level ${step.level}: spend the Ability Score Improvement.`);
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
