'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';

import { getClassBuildAction } from '../../actions';
import { composeSheet, type BuildRefs } from '../../lib/compose';
import type { ResolvedContent } from '../useResolvedContent';
import { syncLevels } from '../../lib/advancement';
import type {
  BuildCatalog,
  ClassDef,
  ContentSource,
} from '../../lib/srd/types';
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
  /** The table being built for; a homebrew class may live only in its library. */
  campaignId?: string;
  /**
   * Stats for what the sheet carries. Armour class is composed from this, so
   * until it is 'ready' the composed sheet leaves the stored AC alone rather
   * than asserting the unarmoured value over it.
   */
  content?: ResolvedContent;
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
export function useGuidedBuild({
  getValues,
  setValue,
  catalog,
  campaignId,
  content,
}: Options) {
  const [classDef, setClassDef] = useState<ClassDef | null>(null);
  const [loadingClass, setLoadingClass] = useState(false);
  const classDefRef = useRef<ClassDef | null>(null);

  // Read through a ref so that content arriving does not re-create every
  // callback below it — the recompute it needs to trigger is the effect at the
  // end of this hook, not a new identity for `patchBuild`.
  const contentRef = useRef<ResolvedContent | undefined>(content);
  contentRef.current = content;

  const refsFor = useCallback(
    (build: CharacterBuild, def: ClassDef | null): BuildRefs => ({
      classDef: def,
      species: catalog.species.find(s => s.key === build.speciesKey) ?? null,
      background:
        catalog.backgrounds.find(b => b.key === build.backgroundKey) ?? null,
      // Only once it has actually resolved. `BuildRefs.content` treats
      // undefined as "not known", which is what keeps a recompute from
      // overwriting a worn character's armour class with the unarmoured one.
      content:
        contentRef.current?.status === 'ready'
          ? contentRef.current.entries
          : undefined,
    }),
    [catalog]
  );

  const recompute = useCallback(
    (def: ClassDef | null = classDefRef.current) => {
      const current = getValues();
      if (current.build.mode !== 'guided') return;
      const next = composeSheet(current, refsFor(current.build, def));
      for (const group of COMPOSED_GROUPS) {
        if (JSON.stringify(next[group]) === JSON.stringify(current[group]))
          continue;
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
    async (key: string, name: string, source: ContentSource = 'srd') => {
      setLoadingClass(true);
      try {
        const def = key ? await getClassBuildAction(key, campaignId) : null;
        classDefRef.current = def;
        setClassDef(def);

        const level = getValues('identity.level');
        const build = getValues('build');
        const changed = build.classKey !== key;
        const nextBuild: CharacterBuild = {
          ...build,
          classKey: key,
          className: name,
          classSource: source,
          subclassKey: changed ? '' : build.subclassKey,
          subclassName: changed ? '' : build.subclassName,
          subclassSource: changed ? 'srd' : build.subclassSource,
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
            subclassSource: 'srd' as const,
          }));
        }
        setValue('build', nextBuild, { shouldDirty: true });
        recompute(def);
      } finally {
        setLoadingClass(false);
      }
    },
    [getValues, setValue, recompute, campaignId]
  );

  /**
   * Pick a species, and a background.
   *
   * Both live here rather than inside their steps because they have a second
   * caller: `/creator/character?species=…` opens the wizard with the pick
   * already made, and a deep link that re-implemented "what choosing a species
   * resets" would drift from the step the first time either changed.
   *
   * The size the species grants is deliberately *not* set here — that is an
   * override on a composed path, and the wizard owns that bookkeeping.
   */
  const chooseSpecies = useCallback(
    (key: string, name: string) => {
      const next = catalog.species.find(s => s.key === key);
      patchBuild(b => ({
        ...b,
        speciesKey: key,
        speciesName: name,
        speciesSource: next?.source ?? 'srd',
        // Lineage picks and the free skill belong to the species that granted
        // them.
        speciesChoices: b.speciesKey === key ? b.speciesChoices : [],
        bonusSkills: b.speciesKey === key ? b.bonusSkills : [],
      }));
    },
    [catalog, patchBuild]
  );

  const chooseBackground = useCallback(
    (key: string, name: string) => {
      const next = catalog.backgrounds.find(b => b.key === key);
      patchBuild(b => ({
        ...b,
        backgroundKey: key,
        backgroundName: name,
        backgroundSource: next?.source ?? 'srd',
        backgroundBoost:
          b.backgroundKey === key
            ? b.backgroundBoost
            : { mode: 'two-one', plusTwo: '', plusOnes: [] },
        equipment: {
          ...b.equipment,
          backgroundOption:
            b.backgroundKey === key ? b.equipment.backgroundOption : '',
        },
      }));
    },
    [catalog, patchBuild]
  );

  /**
   * Recompose when the inventory finishes resolving.
   *
   * The fetch is asynchronous, so the first few composes run without it and
   * deliberately leave armour class alone. This is the pass that finally sets
   * it — without it, a reopened character in plate kept whatever AC was
   * stored until the player happened to change something else.
   */
  useEffect(() => {
    if (content?.status !== 'ready') return;
    recompute();
  }, [content, recompute]);

  /** Re-attach the class definition when an existing character is reopened. */
  const restoreClass = useCallback(
    async (key: string) => {
      if (!key || classDefRef.current?.key === key) return;
      setLoadingClass(true);
      try {
        const def = await getClassBuildAction(key, campaignId);
        classDefRef.current = def;
        setClassDef(def);
        recompute(def);
      } finally {
        setLoadingClass(false);
      }
    },
    [recompute, campaignId]
  );

  return {
    classDef,
    loadingClass,
    refs: (build: CharacterBuild) => refsFor(build, classDef),
    patchBuild,
    recompute,
    setLevel,
    chooseClass,
    chooseSpecies,
    chooseBackground,
    restoreClass,
  };
}
