'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Tab, Tabs } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';

import {
  checkSheetAgainstRules,
  describeRules,
  type CampaignRules,
} from '@/@creator/campaign/lib/rules';

import { saveCharacterAction } from '../actions';
import {
  characterSheetSchema,
  makeEmptySheet,
  type CharacterSheet,
  type HomebrewKind,
} from '../schema';
import type { BuildCatalog } from '../lib/srd/types';
import {
  genUid,
  makeProvenanceLogger,
  reconcileProvenance,
  type ProvenanceInput,
} from '../lib/provenance';
import {
  AbilityScoresSection,
  ChangeLogSection,
  CombatSection,
  CurrencySection,
  DetailsSection,
  EquipmentSection,
  HomebrewSection,
  IdentitySection,
  ProficienciesSection,
  type ReferenceOptions,
  SkillsSection,
  SpellcastingSection,
} from './sections';
import { CharacterWizard } from './wizard/CharacterWizard';

interface CharacterFormProps {
  reference: ReferenceOptions;
  /** Parsed SRD data the guided builder runs on. */
  catalog: BuildCatalog;
  characterId?: string;
  initialSheet?: CharacterSheet;
  /** When the builder is opened for a specific table, its rules are enforced. */
  campaignRules?: CampaignRules;
  campaignAllowHomebrew?: boolean;
  campaignName?: string;
}

type View = 'guided' | 'sheet';

/**
 * A brand-new character opens in the guided builder, so its build has to say
 * so from the first render. `makeEmptySheet` defaults to `manual` — the right
 * default for the schema, wrong for this form — and `composeSheet` returns the
 * sheet untouched for a manual build, so leaving it would mean nothing a class,
 * species or background grants ever reaches the sheet.
 */
function newGuidedSheet(): CharacterSheet {
  const sheet = makeEmptySheet();
  return { ...sheet, build: { ...sheet.build, mode: 'guided' } };
}

const SHEET_TABS = [
  { key: 'core', label: 'Identity & combat' },
  { key: 'abilities', label: 'Abilities & skills' },
  { key: 'magic', label: 'Magic & training' },
  { key: 'story', label: 'Story & gear' },
] as const;

type SheetTab = (typeof SHEET_TABS)[number]['key'];

export function CharacterForm({
  reference,
  catalog,
  characterId,
  initialSheet,
  campaignRules,
  campaignAllowHomebrew = true,
  campaignName,
}: CharacterFormProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { isSubmitting, isDirty },
  } = useForm<CharacterSheet>({
    resolver: zodResolver(characterSheetSchema) as Resolver<CharacterSheet>,
    defaultValues: initialSheet ?? newGuidedSheet(),
  });

  // A brand-new character starts in the guided builder; a sheet saved before
  // the builder existed opens on the sheet it was written as.
  const [view, setView] = useState<View>(() =>
    !initialSheet || initialSheet.build.mode === 'guided' ? 'guided' : 'sheet'
  );
  const [sheetTab, setSheetTab] = useState<SheetTab>('core');

  const log = useCallback(
    (input: ProvenanceInput) =>
      makeProvenanceLogger(
        () => getValues('provenance') ?? [],
        next => setValue('provenance', next, { shouldDirty: true })
      )(input),
    [getValues, setValue]
  );

  const dropHomebrewLog = useCallback(
    (field: string) => {
      const list = getValues('provenance') ?? [];
      const next = list.filter(
        p => !(p.kind === 'homebrew' && p.label === field)
      );
      if (next.length !== list.length)
        setValue('provenance', next, { shouldDirty: true });
    },
    [getValues, setValue]
  );

  const handleCustomField = useCallback(
    (field: string, kind: HomebrewKind, value: string, isCustom: boolean) => {
      const entries = getValues('homebrew.entries') ?? [];
      const idx = entries.findIndex(e => e.field === field);
      const trimmed = value.trim();

      if (isCustom && trimmed) {
        let next = entries;
        if (idx < 0) {
          next = [
            ...entries,
            { id: genUid(), kind, name: trimmed, field, traits: [] },
          ];
        } else if (entries[idx].name !== trimmed) {
          next = entries.map((e, i) =>
            i === idx ? { ...e, name: trimmed } : e
          );
        }
        if (next !== entries) {
          setValue('homebrew.entries', next, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
        setValue('homebrew.isHomebrew', true, { shouldDirty: true });
        log({
          kind: 'homebrew',
          label: field,
          detail: `Custom ${kind}: "${trimmed}"`,
        });
      } else if (idx >= 0) {
        const next = entries.filter((_, i) => i !== idx);
        setValue('homebrew.entries', next, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue('homebrew.isHomebrew', next.length > 0, { shouldDirty: true });
        dropHomebrewLog(field);
      }
    },
    [getValues, setValue, log, dropHomebrewLog]
  );

  const onSubmit = handleSubmit(
    async values => {
      setBanner(null);
      const payload: CharacterSheet = {
        ...values,
        homebrew: {
          ...values.homebrew,
          isHomebrew:
            values.homebrew.isHomebrew || values.homebrew.entries.length > 0,
        },
        provenance: reconcileProvenance(values),
      };

      if (campaignRules) {
        const violations = checkSheetAgainstRules(payload, campaignRules, {
          allowHomebrew: campaignAllowHomebrew,
        });
        if (violations.length) {
          setBanner({
            kind: 'error',
            text: `This table's rules: ${violations
              .map(v => v.message)
              .join(' ')}`,
          });
          return;
        }
      }

      const result = await saveCharacterAction(payload, characterId);
      if (result.ok) {
        setBanner({ kind: 'success', text: 'Inscribed.' });
        router.push('/characters');
        router.refresh();
      } else {
        setBanner({
          kind: 'error',
          text: result.error ?? 'Failed to save character.',
        });
      }
    },
    () => {
      setBanner({
        kind: 'error',
        text: 'Some fields need attention — check the highlighted inputs.',
      });
    }
  );

  /** Turn the guided builder on, taking ownership of the derived fields. */
  const enterGuided = () => {
    if (getValues('build.mode') !== 'guided') {
      setValue('build.mode', 'guided', { shouldDirty: true });
      log({
        kind: 'method',
        label: 'Builder',
        detail: 'Switched to the guided builder.',
      });
    }
    setView('guided');
  };

  const enterSheet = () => {
    setView('sheet');
  };

  const ruleLines = campaignRules
    ? describeRules(campaignRules, { allowHomebrew: campaignAllowHomebrew })
    : [];

  const actions = (
    <>
      <Button
        type="button"
        variant="bordered"
        className="border-line text-ink"
        isDisabled={isSubmitting || !isDirty}
        onPress={() => reset(initialSheet ?? newGuidedSheet())}
      >
        Reset
      </Button>
      <Button
        type="submit"
        size="lg"
        isLoading={isSubmitting}
        color="primary"
        className="px-8"
      >
        {characterId ? 'Save changes' : 'Create character'}
      </Button>
    </>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {campaignRules && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm">
          <p className="font-display-alt uppercase tracking-[0.12em] text-ink-muted">
            Building for {campaignName ?? 'a campaign'}
          </p>
          {ruleLines.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">
              {ruleLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-ink-muted">
              This table uses the standard rules.
            </p>
          )}
        </div>
      )}

      {banner && (
        <div
          className={`rounded-lg border p-3 text-center text-sm ${
            banner.kind === 'error'
              ? 'border-danger/40 bg-danger/10 text-danger'
              : 'border-success/40 bg-success/10 text-success'
          }`}
        >
          {banner.text}
        </div>
      )}

      {view === 'guided' ? (
        <CharacterWizard
          control={control}
          setValue={setValue}
          getValues={getValues}
          catalog={catalog}
          log={log}
          onCustomField={handleCustomField}
          maxLevel={campaignRules?.maxStartingLevel ?? 20}
          allowedMethods={campaignRules?.abilityMethods}
          footer={actions}
          onSwitchToSheet={enterSheet}
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              aria-label="Sheet sections"
              selectedKey={sheetTab}
              onSelectionChange={key => setSheetTab(key as SheetTab)}
              classNames={{ tabList: 'bg-surface-2' }}
            >
              {SHEET_TABS.map(tab => (
                <Tab key={tab.key} title={tab.label} />
              ))}
            </Tabs>
            <button
              type="button"
              onClick={enterGuided}
              className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Use the guided builder
            </button>
          </div>

          {sheetTab === 'core' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <IdentitySection
                control={control}
                reference={reference}
                onCustomField={handleCustomField}
              />
              <CombatSection control={control} />
            </div>
          )}

          {sheetTab === 'abilities' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <AbilityScoresSection
                control={control}
                setValue={setValue}
                log={log}
                allowedMethods={campaignRules?.abilityMethods}
              />
              <SkillsSection control={control} />
            </div>
          )}

          {sheetTab === 'magic' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <SpellcastingSection control={control} />
              <ProficienciesSection control={control} />
            </div>
          )}

          {sheetTab === 'story' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <DetailsSection control={control} />
              <div className="space-y-5">
                <EquipmentSection control={control} />
                <CurrencySection control={control} />
                <HomebrewSection control={control} setValue={setValue} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-4 border-t border-line pt-5">
            {actions}
          </div>
        </div>
      )}

      <ChangeLogSection control={control} />
    </form>
  );
}
