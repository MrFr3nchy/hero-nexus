'use client';

import { useCallback, useRef, useState } from 'react';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';

import { getClassBuildAction } from '../../actions';
import { composeSheet, type BuildRefs } from '../../lib/compose';
import { syncLevels } from '../../lib/advancement';
import type { BuildCatalog, ClassDef } from '../../lib/srd/types';
import type { CharacterBuild, CharacterSheet } from '../../schema';

/** The sheet groups a guided build owns; everything else is left alone. */
const COMPOSED_GROUPS = [
  'identity',
  'abilities',
  'skills',
  'combat',
  'proficiencies',
  'spellcasting',
  'details',
  'equipment',
  'currency',
] as const;

interface Options {
  getValues: UseFormGetValues<CharacterSheet>;
  setValue: UseFormSetValue<CharacterSheet>;
  catalog: BuildCatalog;
}

/**
 * Holds the one piece of build state that isn't in the form — the full class
 * definition, which is fetched on demand — and funnels every wizard edit
 * through a single "change the build, then recompute the sheet" path.
 *
 * Recomputing eagerly (rather than in an effect) keeps the sheet honest: swap
 * a Wizard for a Barbarian and the spell slots, hit dice, saves, features and
 * starting gear all move in the same tick, with no render loop to guard.
 */
export function useGuidedBuild({ getValues, setValue, catalog }: Options) {
  const [classDef, setClassDef] = useState<ClassDef | null>(null);
  const [loadingClass, setLoadingClass] = useState(false);
  const classDefRef = useRef<ClassDef | null>(null);

  const refsFor = useCallback(
    (build: CharacterBuild, def: ClassDef | null): BuildRefs => ({
      classDef: def,
      species: catalog.species.find(s => s.key === build.speciesKey) ?? null,
      background:
        catalog.backgrounds.find(b => b.key === build.backgroundKey) ?? null,
    }),
    [catalog]
  );

  const recompute = useCallback(
    (def: ClassDef | null = classDefRef.current) => {
      const current = getValues();
      if (current.build.mode !== 'guided') return;
      const next = composeSheet(current, refsFor(current.build, def));
      for (const group of COMPOSED_GROUPS) {
        if (JSON.stringify(next[group]) === JSON.stringify(current[group])) continue;
        setValue(group, next[group], { shouldDirty: true });
      }
    },
    [getValues, setValue, refsFor]
  );

  /** Change the build and immediately re-derive the sheet from it. */
  const patchBuild = useCallback(
    (mutate: (build: CharacterBuild) => CharacterBuild) => {
      const next = mutate(getValues('build'));
      setValue('build', next, { shouldDirty: true });
      recompute();
    },
    [getValues, setValue, recompute]
  );

  /** Set the character level and re-shape the level-up log to match. */
  const setLevel = useCallback(
    (level: number) => {
      const clamped = Math.max(1, Math.min(20, level));
      setValue('identity.level', clamped, { shouldDirty: true });
      patchBuild(build => ({
        ...build,
        levels: syncLevels(
          build,
          clamped,
          classDefRef.current?.hitDie ?? getValues('combat.hitDieSize')
        ),
      }));
    },
    [setValue, patchBuild, getValues]
  );

  /**
   * Pick a class. Loads the full definition, resets the choices that only made
   * sense for the previous class, and rebuilds the level log around the new
   * hit die.
   */
  const chooseClass = useCallback(
    async (key: string, name: string) => {
      setLoadingClass(true);
      try {
        const def = key ? await getClassBuildAction(key) : null;
        classDefRef.current = def;
        setClassDef(def);

        const level = getValues('identity.level');
        const build = getValues('build');
        const changed = build.classKey !== key;
        const nextBuild: CharacterBuild = {
          ...build,
          classKey: key,
          className: name,
          subclassKey: changed ? '' : build.subclassKey,
          subclassName: changed ? '' : build.subclassName,
          classSkills: changed ? [] : build.classSkills,
          equipment: {
            ...build.equipment,
            classOption: changed ? '' : build.equipment.classOption,
          },
          levels: [],
        };
        nextBuild.levels = syncLevels(nextBuild, level, def?.hitDie ?? 8);
        if (changed) {
          // A subclass belongs to exactly one class; drop the old pick.
          nextBuild.levels = nextBuild.levels.map(l => ({
            ...l,
            subclassKey: '',
            subclassName: '',
          }));
        }
        setValue('build', nextBuild, { shouldDirty: true });
        recompute(def);
      } finally {
        setLoadingClass(false);
      }
    },
    [getValues, setValue, recompute]
  );

  /** Re-attach the class definition when an existing character is reopened. */
  const restoreClass = useCallback(
    async (key: string) => {
      if (!key || classDefRef.current?.key === key) return;
      setLoadingClass(true);
      try {
        const def = await getClassBuildAction(key);
        classDefRef.current = def;
        setClassDef(def);
        recompute(def);
      } finally {
        setLoadingClass(false);
      }
    },
    [recompute]
  );

  return {
    classDef,
    loadingClass,
    refs: (build: CharacterBuild) => refsFor(build, classDef),
    patchBuild,
    recompute,
    setLevel,
    chooseClass,
    restoreClass,
  };
}
