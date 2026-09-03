'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Input } from '@heroui/react';
import {
  type Control,
  type UseFormGetValues,
  type UseFormSetValue,
  useWatch,
} from 'react-hook-form';

import { Marginalia, SheetPreview } from '@/@shared/components/ui';

import { type CharacterSheet } from '../../schema';
import { COMPOSED_PATHS } from '../../lib/compose';
import {
  abilityModifier,
  fmtBonus,
  proficiencyBonus,
  spellSaveDC,
} from '../../lib/derive';
import type { BuildCatalog } from '../../lib/srd/types';
import {
  findBuildIssues,
  OPEN_LIMITS,
  type BuildLimits,
  type StepId,
} from '../../lib/validate-build';
import type { ProvenanceInput } from '../../lib/provenance';
import type { CustomFieldHandler } from '../sections';

import { useGuidedBuild } from './useGuidedBuild';
import type { StepProps } from './types';
import { AbilitiesStep } from './steps/AbilitiesStep';
import { AdvancementStep } from './steps/AdvancementStep';
import { BackgroundStep } from './steps/BackgroundStep';
import { ClassStep } from './steps/ClassStep';
import { DetailsStep } from './steps/DetailsStep';
import { EquipmentStep } from './steps/EquipmentStep';
import { ReviewStep } from './steps/ReviewStep';
import { SkillsStep } from './steps/SkillsStep';
import { SpeciesStep } from './steps/SpeciesStep';

interface CharacterWizardProps {
  control: Control<CharacterSheet>;
  setValue: UseFormSetValue<CharacterSheet>;
  getValues: UseFormGetValues<CharacterSheet>;
  catalog: BuildCatalog;
  log: (input: ProvenanceInput) => void;
  onCustomField: CustomFieldHandler;
  /** What the chosen campaign allows. Defaults to an unconstrained build. */
  limits?: BuildLimits;
  /** Campaign picker and anything else that belongs above the first step. */
  header?: ReactNode;
  /**
   * Save / reset controls, owned by the form around this. Given the build's
   * completeness so the form can keep an unfinished character unsaveable.
   */
  footer?: (status: { complete: boolean; remaining: number }) => ReactNode;
  onSwitchToSheet: () => void;
}

const STEPS: { id: StepId; label: string; caption: string }[] = [
  { id: 'class', label: 'Class', caption: 'what you do' },
  { id: 'species', label: 'Species', caption: 'what you are' },
  { id: 'background', label: 'Background', caption: 'where you came from' },
  { id: 'abilities', label: 'Abilities', caption: 'the six numbers' },
  { id: 'skills', label: 'Skills', caption: 'what you are good at' },
  { id: 'advancement', label: 'Levels', caption: 'the climb' },
  { id: 'equipment', label: 'Equipment', caption: 'what you carry' },
  { id: 'details', label: 'Details', caption: 'who you are' },
  { id: 'review', label: 'Review', caption: 'read it back' },
];

const COMPOSED = new Set<string>(COMPOSED_PATHS);

/**
 * The guided character builder.
 *
 * One decision per step, each one autoloading whatever the SRD says it grants,
 * with the sheet-so-far visible the whole way (design rule 1: the object is
 * the hero). The form underneath is still the same react-hook-form sheet, so
 * the hand-built sheet view and this wizard are two views of one document.
 */
export function CharacterWizard({
  control,
  setValue,
  getValues,
  catalog,
  log,
  onCustomField,
  limits = OPEN_LIMITS,
  header,
  footer,
  onSwitchToSheet,
}: CharacterWizardProps) {
  const sheet = useWatch({ control }) as CharacterSheet;
  const [stepId, setStepId] = useState<StepId>('class');

  const guided = useGuidedBuild({ getValues, setValue, catalog });
  const {
    classDef,
    loadingClass,
    patchBuild,
    setLevel,
    chooseClass,
    restoreClass,
  } = guided;

  const level = sheet?.identity.level ?? 1;
  const method = sheet?.generation.abilityMethod;

  // Picking a table mid-build can invalidate choices already made. Rather than
  // refuse the sheet at save time, pull them back inside the rules.
  useEffect(() => {
    if (level > limits.maxLevel) setLevel(limits.maxLevel);
  }, [level, limits.maxLevel, setLevel]);

  useEffect(() => {
    if (!method) return;
    if (limits.allowedMethods.length === 0) return;
    if (limits.allowedMethods.includes(method)) return;
    setValue('generation.abilityMethod', limits.allowedMethods[0], {
      shouldDirty: true,
    });
  }, [method, limits.allowedMethods, setValue]);

  // Reopening a saved character: pull its class definition back in so the
  // level log and feature text have something to work from.
  useEffect(() => {
    void restoreClass(getValues('build.classKey'));
  }, [restoreClass, getValues]);

  /**
   * Write a sheet field by hand. Paths the build normally owns are recorded as
   * overrides so a later recompute leaves the player's wording alone.
   */
  const setOverride = (path: string, value: unknown) => {
    setValue(path as never, value as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (!COMPOSED.has(path)) return;
    patchBuild(build =>
      build.overrides.includes(path)
        ? build
        : { ...build, overrides: [...build.overrides, path] }
    );
  };

  const refs = useMemo(
    () => ({
      classDef,
      species:
        catalog.species.find(s => s.key === sheet?.build?.speciesKey) ?? null,
      background:
        catalog.backgrounds.find(b => b.key === sheet?.build?.backgroundKey) ??
        null,
    }),
    [classDef, catalog, sheet?.build?.speciesKey, sheet?.build?.backgroundKey]
  );

  const issues = useMemo(
    () => (sheet?.build ? findBuildIssues(sheet, refs, limits) : []),
    [sheet, refs, limits]
  );

  const issuesFor = (id: StepId) => issues.filter(i => i.step === id);

  const stepProps: StepProps = {
    sheet,
    build: sheet?.build,
    catalog,
    limits,
    classDef,
    loadingClass,
    control,
    patchBuild,
    setOverride,
    setLevel,
    chooseClass: (key, name) => void chooseClass(key, name),
    log,
    onCustomField,
  };

  const index = STEPS.findIndex(s => s.id === stepId);

  /**
   * The first step still missing a decision. Everything up to and including it
   * is open; beyond it the build has nothing to show yet, so the rail and the
   * Next button both stop there.
   */
  const firstOpen = STEPS.findIndex(s => issuesFor(s.id).length > 0);
  const lastReachable = firstOpen === -1 ? STEPS.length - 1 : firstOpen;
  const blocking = issuesFor(stepId);

  const go = (delta: number) => {
    const next = STEPS[index + delta];
    if (!next) return;
    if (delta > 0 && index + delta > lastReachable) return;
    setStepId(next.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!sheet?.build) return null;

  const body = () => {
    switch (stepId) {
      case 'class':
        return <ClassStep {...stepProps} />;
      case 'species':
        return <SpeciesStep {...stepProps} />;
      case 'background':
        return <BackgroundStep {...stepProps} />;
      case 'abilities':
        return <AbilitiesStep {...stepProps} />;
      case 'skills':
        return <SkillsStep {...stepProps} />;
      case 'advancement':
        return <AdvancementStep {...stepProps} />;
      case 'equipment':
        return <EquipmentStep {...stepProps} />;
      case 'details':
        return <DetailsStep {...stepProps} />;
      case 'review':
        return (
          <ReviewStep {...stepProps} issues={issues.map(i => i.message)} />
        );
    }
  };

  const meta = [
    `Level ${sheet.identity.level}`,
    sheet.build.speciesName,
    sheet.build.subclassName || sheet.build.className,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-5">
      {header}

      {/* ---- the one thing that is always on screen ---- */}
      <div className="flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <Input
          label="Character name"
          value={sheet.identity.name}
          onValueChange={value =>
            setValue('identity.name', value, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          className="min-w-[16rem] flex-1"
          classNames={{ inputWrapper: 'bg-surface-2 border-line' }}
        />
        <div className="text-sm text-ink-muted">
          <div className="font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
            So far
          </div>
          {meta || 'nothing chosen yet'}
        </div>
        <button
          type="button"
          onClick={onSwitchToSheet}
          className="ml-auto text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Edit the raw sheet instead
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_18rem]">
        {/* ---- step rail ---- */}
        <nav
          className="lg:sticky lg:top-6 lg:self-start"
          aria-label="Builder steps"
        >
          <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {STEPS.map((step, i) => {
              const open = issuesFor(step.id).length;
              const active = step.id === stepId;
              const behind = i < index;
              const locked = i > lastReachable;
              return (
                <li key={step.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    disabled={locked}
                    title={
                      locked
                        ? 'Finish the steps before this one first.'
                        : undefined
                    }
                    onClick={() => setStepId(step.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-gold bg-gold/10'
                        : locked
                          ? 'cursor-not-allowed border-transparent opacity-45'
                          : 'border-transparent hover:border-line hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.7rem] tabular-nums ${
                        open > 0
                          ? 'border-warning/60 text-warning'
                          : behind || active
                            ? 'border-gold/60 text-gold-strong'
                            : 'border-line text-ink-subtle'
                      }`}
                    >
                      {open > 0 ? '!' : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">
                        {step.label}
                      </span>
                      <span className="hidden truncate text-xs text-ink-subtle lg:block">
                        {step.caption}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* ---- current step ---- */}
        <div className="min-w-0">
          {body()}

          <div className="mt-8 border-t border-line pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="bordered"
                className="border-line text-ink"
                isDisabled={index === 0}
                onPress={() => go(-1)}
              >
                Back
              </Button>
              {index < STEPS.length - 1 ? (
                <Button
                  color="primary"
                  isDisabled={blocking.length > 0}
                  onPress={() => go(1)}
                >
                  Next — {STEPS[index + 1].label}
                </Button>
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-3">
                {footer?.({
                  complete: issues.length === 0,
                  remaining: issues.length,
                })}
              </div>
            </div>

            {blocking.length > 0 && (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning">
                <p>Finish this step first:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {blocking.map(issue => (
                    <li key={issue.message}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {blocking.length === 0 && issues.length > 0 && (
              <p className="mt-3 text-sm text-ink-muted">
                {issues.length} decision{issues.length === 1 ? '' : 's'} left on{' '}
                {firstOpen === -1 ? 'another step' : STEPS[firstOpen].label} —
                the character can be saved once they are made.
              </p>
            )}
          </div>
        </div>

        {/* ---- the sheet so far ---- */}
        <aside className="hidden xl:block xl:sticky xl:top-6 xl:self-start">
          <SheetPreview
            name={sheet.identity.name || 'Unnamed hero'}
            meta={meta || 'a blank page'}
            abilities={{
              str: sheet.abilities.strength.score,
              dex: sheet.abilities.dexterity.score,
              con: sheet.abilities.constitution.score,
              int: sheet.abilities.intelligence.score,
              wis: sheet.abilities.wisdom.score,
              cha: sheet.abilities.charisma.score,
            }}
            derived={[
              { label: 'Armour class', value: sheet.combat.armorClass },
              { label: 'Hit points', value: sheet.combat.hitPointsMax },
              {
                label: 'Proficiency',
                value: fmtBonus(proficiencyBonus(sheet.identity.level)),
              },
              {
                label: 'Initiative',
                value: fmtBonus(
                  abilityModifier(sheet.abilities.dexterity.score)
                ),
              },
              ...(sheet.spellcasting.ability
                ? [{ label: 'Spell save DC', value: spellSaveDC(sheet) ?? '—' }]
                : []),
            ]}
          />
          {issues.length > 0 ? (
            <p className="mt-3 text-sm text-warning">
              {issues.length} decision{issues.length === 1 ? '' : 's'} left.
            </p>
          ) : (
            <Marginalia dash className="mt-3">
              ready to be inscribed
            </Marginalia>
          )}
        </aside>
      </div>
    </div>
  );
}
