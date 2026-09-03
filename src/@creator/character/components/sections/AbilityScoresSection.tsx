'use client';

import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import { SectionCard } from '@/@shared/components/ui';
import type { RollMode } from '@/@shared/lib/dice';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type AbilityKey,
  type AbilityMethod,
  type CharacterSheet,
} from '../../schema';
import type { ProvenanceInput } from '../../lib/provenance';
import {
  AbilityScorePicker,
  type AbilityScores,
} from '../AbilityScorePicker';

/**
 * The hand-built sheet's ability block: a react-hook-form adapter around
 * {@link AbilityScorePicker}, which the guided wizard also uses (pointed at
 * the build's base scores instead of the sheet's).
 */
export function AbilityScoresSection({
  control,
  setValue,
  log,
  allowedMethods,
}: {
  control: Control<CharacterSheet>;
  setValue: UseFormSetValue<CharacterSheet>;
  log: (input: ProvenanceInput) => void;
  allowedMethods?: AbilityMethod[];
}) {
  const sheet = useWatch({ control }) as CharacterSheet;
  const method: AbilityMethod = sheet?.generation?.abilityMethod ?? 'manual';
  const rollMode: RollMode = sheet?.generation?.rollMode ?? '3d6';

  const scores = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, sheet?.abilities?.[k]?.score ?? 10])
  ) as AbilityScores;

  const proficiencies = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, sheet?.abilities?.[k]?.proficientSave ?? false])
  ) as Record<AbilityKey, boolean>;

  const writeScores = (next: AbilityScores) => {
    for (const key of ABILITY_KEYS) {
      if (next[key] === scores[key]) continue;
      setValue(`abilities.${key}.score`, next[key], {
        shouldDirty: true,
        shouldValidate: true,
      });
      if (method === 'manual') {
        log({
          kind: 'stat-manual',
          label: ABILITY_LABELS[key],
          detail: `${ABILITY_LABELS[key]} set to ${next[key]}`,
        });
      }
    }
  };

  return (
    <SectionCard framed title="Ability Scores" bodyClassName="space-y-4">
      <AbilityScorePicker
        scores={scores}
        onScores={writeScores}
        method={method}
        onMethod={next => {
          setValue('generation.abilityMethod', next, { shouldDirty: true });
          log({
            kind: 'method',
            label: 'Ability scores',
            detail: `Generation method: ${next}`,
          });
        }}
        rollMode={rollMode}
        onRollMode={next => {
          setValue('generation.rollMode', next, { shouldDirty: true });
          log({
            kind: 'method',
            label: 'Roll mode',
            detail: `Roll mode: ${next === '3d6' ? '3d6 (keep all)' : '4d6, keep highest 3'}`,
          });
        }}
        log={log}
        allowedMethods={allowedMethods}
        saveProficiencies={proficiencies}
        onToggleSave={(ability, next) =>
          setValue(`abilities.${ability}.proficientSave`, next, {
            shouldDirty: true,
          })
        }
      />
    </SectionCard>
  );
}
