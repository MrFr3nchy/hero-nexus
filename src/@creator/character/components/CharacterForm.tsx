'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@heroui/react';
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

interface CharacterFormProps {
  reference: ReferenceOptions;
  characterId?: string;
  initialSheet?: CharacterSheet;
  /** When the builder is opened for a specific table, its rules are enforced. */
  campaignRules?: CampaignRules;
  campaignAllowHomebrew?: boolean;
  campaignName?: string;
}

export function CharacterForm({
  reference,
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
    defaultValues: initialSheet ?? makeEmptySheet(),
  });

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

  const ruleLines = campaignRules
    ? describeRules(campaignRules, { allowHomebrew: campaignAllowHomebrew })
    : [];

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

      <div className="relative grid grid-cols-1 gap-6 rounded-[var(--radius-card)] border border-gold/25 p-4 shadow-[inset_0_0_0_1px_var(--line)] lg:grid-cols-2 lg:p-6">
        <div className="space-y-6">
          <IdentitySection
            control={control}
            reference={reference}
            onCustomField={handleCustomField}
          />
          <AbilityScoresSection
            control={control}
            setValue={setValue}
            log={log}
            allowedMethods={campaignRules?.abilityMethods}
          />
          <CombatSection control={control} />
          <SkillsSection control={control} />
        </div>
        <div className="space-y-6">
          <HomebrewSection control={control} setValue={setValue} />
          <SpellcastingSection control={control} />
          <ProficienciesSection control={control} />
          <DetailsSection control={control} />
          <EquipmentSection control={control} />
          <CurrencySection control={control} />
        </div>
      </div>

      <ChangeLogSection control={control} />

      <div className="flex flex-wrap justify-center gap-4">
        <Button
          type="button"
          variant="bordered"
          className="border-line text-ink"
          isDisabled={isSubmitting || !isDirty}
          onPress={() => reset(initialSheet ?? makeEmptySheet())}
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
          {characterId ? 'Save Changes' : 'Create Character'}
        </Button>
      </div>
    </form>
  );
}
