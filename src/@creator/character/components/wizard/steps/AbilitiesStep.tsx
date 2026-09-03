'use client';

import { ABILITY_KEYS, ABILITY_LABELS, type AbilityKey } from '../../../schema';
import { finalAbilities } from '../../../lib/compose';
import {
  AbilityScorePicker,
  type AbilityScores,
} from '../../AbilityScorePicker';
import { StepHeading } from '../parts';
import type { StepProps } from '../types';

export function AbilitiesStep({
  sheet,
  build,
  classDef,
  limits,
  patchBuild,
  setOverride,
  log,
}: StepProps) {
  const base = build.baseAbilities as AbilityScores;
  const final = finalAbilities(sheet);

  const bonuses = Object.fromEntries(
    ABILITY_KEYS.map(key => [key, final[key] - base[key]])
  ) as Partial<AbilityScores>;

  const boost = build.backgroundBoost;
  const boostAssigned =
    boost.mode === 'three'
      ? boost.plusOnes.length === 3
      : Boolean(boost.plusTwo) && boost.plusOnes.length === 1;

  return (
    <div>
      <StepHeading
        title="Set the ability scores"
        lede="These six numbers drive nearly every roll. Pick how you want to generate them — the method and every roll are written to the change log your DM reads."
      />

      {build.backgroundName && (
        <p
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            boostAssigned
              ? 'border-gold/40 bg-gold/5 text-ink-muted'
              : 'border-warning/40 bg-warning/5 text-warning'
          }`}
        >
          {boostAssigned
            ? `Your ${build.backgroundName} background adds ${ABILITY_KEYS.filter(
                k => (bonuses[k] ?? 0) > 0
              )
                .map(k => `+${bonuses[k]} ${ABILITY_LABELS[k]}`)
                .join(', ')} on top of the numbers below.`
            : `Your ${build.backgroundName} background still has an ability increase to assign — go back a step to place it.`}
        </p>
      )}

      <AbilityScorePicker
        scores={base}
        onScores={next =>
          patchBuild(b => ({
            ...b,
            baseAbilities: { ...b.baseAbilities, ...next },
          }))
        }
        allowedMethods={limits.allowedMethods}
        method={sheet.generation.abilityMethod}
        onMethod={next => {
          setOverride('generation.abilityMethod', next);
          log({
            kind: 'method',
            label: 'Ability scores',
            detail: `Generation method: ${next}`,
          });
        }}
        rollMode={sheet.generation.rollMode}
        onRollMode={next => {
          setOverride('generation.rollMode', next);
          log({
            kind: 'method',
            label: 'Roll mode',
            detail: `Roll mode: ${next === '3d6' ? '3d6 (keep all)' : '4d6, keep highest 3'}`,
          });
        }}
        log={log}
        bonuses={bonuses}
        saves={(classDef?.coreTraits.savingThrows ?? []) as AbilityKey[]}
      />
    </div>
  );
}
