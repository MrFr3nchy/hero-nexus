'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import {
  type Control,
  type UseFormGetValues,
  type UseFormSetValue,
  useWatch,
} from 'react-hook-form';

import { Glyph } from '@/@shared/components/ui';
import type { ContentType } from '@/@shared/content';

import { type CharacterSheet } from '../../schema';
import { COMPOSED_PATHS } from '../../lib/compose';
import type { BuildCatalog } from '../../lib/srd/types';
import {
  findBuildIssues,
  OPEN_LIMITS,
  type BuildLimits,
  type StepId,
} from '../../lib/validate-build';
import type { ProvenanceInput } from '../../lib/provenance';
import type { CustomFieldHandler } from '../sections';

import type { ResolvedContent } from '../useResolvedContent';
import { useGuidedBuild } from './useGuidedBuild';
import { ForgeDrawer } from './ForgeDrawer';
import { FullSheetModal, HeroPanel, HeroPanelBody } from './HeroPanel';
import type { ForgeKind, InitialPick, StepProps } from './types';
import { AbilitiesStep } from './steps/AbilitiesStep';
import { AdvancementStep } from './steps/AdvancementStep';
import { BackgroundStep } from './steps/BackgroundStep';
import { ClassStep } from './steps/ClassStep';
import { DetailsStep } from './steps/DetailsStep';
import { EquipmentStep } from './steps/EquipmentStep';
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
  /** The table being built for, so a class picked from its library resolves. */
  campaignId?: string;
  /** The table's name, for the hero panel. */
  campaignName?: string;
  /** Stats for what the sheet carries; armour class is composed from it. */
  content?: ResolvedContent;
  /**
   * A pick made before the wizard opened — the "start a hero with this"
   * button on a compendium shelf. Applied once, on mount, to a build that has
   * not made that pick yet, so reopening a saved character never has its class
   * rewritten by a stale link.
   */
  initialPick?: InitialPick;
  /**
   * Which step to open on. Only read on mount — this is where a "Level up"
   * link lands, and re-reading it would fight the rail on every render.
   */
  initialStep?: StepId;
  /**
   * Reload the option catalog. Awaited after something is forged mid-build, so
   * the thing just made is in the list before the wizard tries to select it.
   */
  onRefreshCatalog: () => Promise<BuildCatalog>;
  /** The table picker and anything else that belongs above the first step. */
  header?: ReactNode;
  /**
   * Save controls, owned by the form around this. Given the build's
   * completeness so the form can decide what to offer — a draft always, a
   * finished hero only once nothing is outstanding.
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
];

const COMPOSED = new Set<string>(COMPOSED_PATHS);

/** Which content type each forgeable pick makes. */
const FORGE_TYPE: Record<ForgeKind, ContentType> = {
  class: 'class',
  species: 'species',
  background: 'background',
};

/**
 * The guided character builder.
 *
 * One decision per step, each one autoloading whatever the SRD says it grants,
 * with the hero-so-far beside it the whole way (design rule 1: the object is
 * the hero). The form underneath is still the same react-hook-form sheet, so
 * the hand-built sheet view and this wizard are two views of one document.
 *
 * Three things this used to do and no longer does:
 *
 *  - **Lock the steps.** Every step past the first incomplete one was
 *    `disabled`, so a player could not name their hero until seven other
 *    decisions were made. The finish gate already exists and is the only gate
 *    worth having; ordering the decisions is the rail's suggestion, not its
 *    rule.
 *  - **Keep a Review step.** It was the most complete view of the character
 *    and the last one reachable. `HeroPanel` carries it on every step now, and
 *    the full sheet behind it is the real `CharacterSheetView`.
 *  - **Offer a name box in place of homebrew.** "A class of your own" wrote a
 *    string; `ForgeDrawer` writes a real, typed, referenceable class.
 */
export function CharacterWizard({
  control,
  setValue,
  getValues,
  catalog,
  log,
  onCustomField,
  limits = OPEN_LIMITS,
  campaignId,
  campaignName,
  content,
  initialPick,
  onRefreshCatalog,
  header,
  footer,
  onSwitchToSheet,
  initialStep,
}: CharacterWizardProps) {
  const sheet = useWatch({ control }) as CharacterSheet;
  const [stepId, setStepId] = useState<StepId>(initialStep ?? 'class');
  const [forgeKind, setForgeKind] = useState<ForgeKind | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const guided = useGuidedBuild({
    getValues,
    setValue,
    catalog,
    campaignId,
    content,
  });
  const {
    classDef,
    loadingClass,
    patchBuild,
    setLevel,
    chooseClass,
    chooseSpecies,
    chooseBackground,
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
   * A pick waiting for the catalog to catch up.
   *
   * Both the arriving-from-a-shelf link and a just-forged option name a key
   * that the *current* catalog may not hold — the shelf link because the
   * catalog is loaded per table, the forged one because it did not exist a
   * moment ago. Rather than two mechanisms, both park the pick here and one
   * effect applies it as soon as the catalog can name it.
   */
  const [pending, setPending] = useState<InitialPick | null>(
    initialPick ?? null
  );

  useEffect(() => {
    if (!pending) return;

    if (pending.kind === 'class') {
      const option = catalog.classes.find(o => o.key === pending.key);
      if (!option) return;
      setPending(null);
      void chooseClass(option.key, option.name, option.source);
      log({ kind: 'field', label: 'Class', detail: `Class: ${option.name}` });
      return;
    }
    if (pending.kind === 'species') {
      const option = catalog.species.find(o => o.key === pending.key);
      if (!option) return;
      setPending(null);
      chooseSpecies(option.key, option.name);
      setValue('identity.size', option.sizes[0] ?? 'Medium', {
        shouldDirty: true,
      });
      log({
        kind: 'field',
        label: 'Species',
        detail: `Species: ${option.name}`,
      });
      return;
    }
    const option = catalog.backgrounds.find(o => o.key === pending.key);
    if (!option) return;
    setPending(null);
    chooseBackground(option.key, option.name);
    log({
      kind: 'field',
      label: 'Background',
      detail: `Background: ${option.name}`,
    });
  }, [
    pending,
    catalog,
    chooseClass,
    chooseSpecies,
    chooseBackground,
    setValue,
    log,
  ]);

  /**
   * Something was forged from inside the build. Reload the catalog first — the
   * `choose*` handlers read it to work out whether a pick is SRD or homebrew,
   * and a stale one would file a brand-new homebrew class as `srd` — then park
   * the pick for the effect above.
   */
  const onForged = useCallback(
    async (kind: ForgeKind, forged: { id: string; name: string }) => {
      setForgeKind(null);
      await onRefreshCatalog();
      setPending({ kind, key: forged.id } as InitialPick);
      log({
        kind: 'homebrew',
        label: kind,
        detail: `Forged ${kind}: "${forged.name}"`,
      });
    },
    [onRefreshCatalog, log]
  );

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

  const goToStep = useCallback((id: StepId) => {
    setStepId(id);
    setPanelOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
    chooseClass: (key, name, source) => void chooseClass(key, name, source),
    chooseSpecies,
    chooseBackground,
    log,
    onCustomField,
    forge: setForgeKind,
  };

  const index = STEPS.findIndex(s => s.id === stepId);
  const blocking = issuesFor(stepId);

  const go = (delta: number) => {
    const next = STEPS[index + delta];
    if (next) goToStep(next.id);
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
    }
  };

  const panelProps = {
    sheet,
    refs,
    issues,
    onGoToStep: goToStep,
    campaignName,
  };

  return (
    <div className="space-y-5">
      {header}

      {/* ---- the hero's name, which is the one field with no step of its own ---- */}
      <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
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
        {/*
          Below xl the hero panel is not in the rail, so the way to it is here
          instead — and it carries the outstanding count, which is the number a
          player wants without opening anything.
        */}
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink-muted transition-colors hover:border-gold/60 hover:text-ink xl:hidden"
        >
          <Glyph name="person" size={15} />
          The hero so far
          {issues.length > 0 && (
            <span className="rounded-full border border-warning/60 px-1.5 text-[0.7rem] tabular-nums text-warning">
              {issues.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onSwitchToSheet}
          className="text-sm text-ink-subtle underline-offset-2 hover:text-ink hover:underline"
        >
          Edit the raw sheet instead
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_21rem]">
        {/* ---- step rail ---- */}
        <nav
          className="lg:sticky lg:top-6 lg:self-start"
          aria-label="Builder steps"
        >
          <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {STEPS.map((step, i) => {
              const open = issuesFor(step.id).length;
              const active = step.id === stepId;
              /*
                The circle always carries the step's number.
                
                It briefly carried the count of open decisions instead, which
                made the rail read "1 1 1 4 5 6 7 1" — the same digit meaning
                "step four" on one row and "four things missing" on another,
                with only a border tint to tell you which. The number is the
                step; whether the step owes anything is the tint plus its own
                count chip, and how many is also in the panel.
              */
              return (
                <li key={step.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-gold bg-gold/10'
                        : 'border-transparent hover:border-line hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.7rem] tabular-nums ${
                        open > 0
                          ? 'border-warning/60 text-warning'
                          : 'border-gold/60 text-gold-strong'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {step.label}
                        </span>
                        {open > 0 && (
                          <span
                            aria-label={`${open} decision${open === 1 ? '' : 's'} open`}
                            className="shrink-0 rounded-full border border-warning/60 px-1.5 text-[0.65rem] tabular-nums text-warning"
                          >
                            {open}
                          </span>
                        )}
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
              {index < STEPS.length - 1 && (
                <Button
                  variant="bordered"
                  className="border-line text-ink"
                  onPress={() => go(1)}
                >
                  Next — {STEPS[index + 1].label}
                </Button>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-3">
                {footer?.({
                  complete: issues.length === 0,
                  remaining: issues.length,
                })}
              </div>
            </div>

            {/*
              A note, not a barrier. `Next` no longer refuses to move while
              this is on screen: leaving a decision for later is a normal way
              to build a character, and the finish control is where being
              unfinished actually costs you something.
            */}
            {blocking.length > 0 && (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning">
                <p>Still open on this step:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {blocking.map(issue => (
                    <li key={issue.message}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ---- the hero so far ---- */}
        <aside className="hidden xl:block xl:sticky xl:top-6 xl:self-start">
          <HeroPanel {...panelProps} />
        </aside>
      </div>

      {/* Same panel, reached by a button, at every width below the rail. */}
      <PanelModal
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        onOpenSheet={() => {
          setPanelOpen(false);
          setSheetOpen(true);
        }}
      >
        <HeroPanelBody {...panelProps} />
      </PanelModal>

      <FullSheetModal
        sheet={sheet}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />

      {forgeKind && (
        <ForgeDrawer
          type={FORGE_TYPE[forgeKind]}
          isOpen
          onClose={() => setForgeKind(null)}
          onForged={forged => void onForged(forgeKind, forged)}
        />
      )}
    </div>
  );
}

/** The rail's contents, as a modal, for widths that have no rail. */
function PanelModal({
  isOpen,
  onClose,
  onOpenSheet,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenSheet: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={open => !open && onClose()}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent className="border border-line bg-surface">
        <ModalHeader className="font-display text-lg text-ink">
          The hero so far
        </ModalHeader>
        <ModalBody className="pb-2">{children}</ModalBody>
        <ModalFooter>
          <Button
            variant="bordered"
            className="border-line text-ink"
            startContent={<Glyph name="notebook" size={14} />}
            onPress={onOpenSheet}
          >
            Read the full sheet
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
