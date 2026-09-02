'use client';

import { useState } from 'react';
import { Button, Tab, Tabs } from '@heroui/react';
import {
  type Control,
  type FieldPath,
  type UseFormSetValue,
  useWatch,
} from 'react-hook-form';

import { SectionCard, DiceRollOverlay } from '@/@shared/components/ui';
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
  pointBuyCost,
  pointBuySpent,
  type Roll4d6Result,
} from '@/@shared/lib/dice';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type AbilityKey,
  type AbilityMethod,
  type CharacterSheet,
} from '../../schema';
import { abilityModifier, fmtBonus, proficiencyBonus } from '../../lib/derive';
import type { ProvenanceInput } from '../../lib/provenance';
import { SheetCheckbox, SheetNumber } from '../fields';

type C = Control<CharacterSheet>;

const SCORE_PATH: Record<AbilityKey, FieldPath<CharacterSheet>> = {
  strength: 'abilities.strength.score',
  dexterity: 'abilities.dexterity.score',
  constitution: 'abilities.constitution.score',
  intelligence: 'abilities.intelligence.score',
  wisdom: 'abilities.wisdom.score',
  charisma: 'abilities.charisma.score',
};

const METHOD_TABS: { key: AbilityMethod; label: string }[] = [
  { key: 'manual', label: 'Manual' },
  { key: 'pointbuy', label: 'Point Buy' },
  { key: 'standard', label: 'Standard Array' },
  { key: 'roll', label: 'Roll' },
];

const METHOD_BLURB: Record<AbilityMethod, string> = {
  manual: 'Type any score from 1 to 30. Every value is written to your log.',
  pointbuy: `Spend ${POINT_BUY_BUDGET} points. Scores run ${POINT_BUY_MIN}–${POINT_BUY_MAX} before species bonuses.`,
  standard:
    'Assign the fixed set 15, 14, 13, 12, 10, 8 — one value per ability.',
  roll: 'Roll 4d6 and drop the lowest. Roll each ability, or roll a full set to assign.',
};

function Derived({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-center">
      <div className="text-[0.7rem] uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </div>
      <div className="font-display text-lg text-ink tabular-nums">{value}</div>
    </div>
  );
}

function AbilityRow({
  ability,
  score,
  pb,
  proficient,
  control,
  children,
}: {
  ability: AbilityKey;
  score: number;
  pb: number;
  proficient: boolean;
  control: C;
  children: React.ReactNode;
}) {
  const mod = abilityModifier(score);
  const save = proficient ? mod + pb : mod;
  return (
    <div className="relative rounded-[var(--radius-card)] border-2 border-line bg-surface-2 px-3 pb-3 pt-4">
      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-sm border border-line bg-surface px-2 py-0.5 font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-muted">
        {ABILITY_LABELS[ability]}
      </span>
      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
        {children}
        <Derived label="Mod" value={fmtBonus(mod)} />
        <Derived label="Save" value={fmtBonus(save)} />
      </div>
      <div className="mt-3">
        <SheetCheckbox
          control={control}
          name={`abilities.${ability}.proficientSave`}
          label={`${ABILITY_LABELS[ability]} save proficiency`}
        />
      </div>
    </div>
  );
}

export function AbilityScoresSection({
  control,
  setValue,
  log,
}: {
  control: C;
  setValue: UseFormSetValue<CharacterSheet>;
  log: (input: ProvenanceInput) => void;
}) {
  const sheet = useWatch({ control }) as CharacterSheet;
  const level = sheet?.identity?.level ?? 1;
  const pb = proficiencyBonus(level);
  const method: AbilityMethod = sheet?.generation?.abilityMethod ?? 'manual';
  const scores = ABILITY_KEYS.map(k => sheet?.abilities?.[k]?.score ?? 10);

  const [overlay, setOverlay] = useState<{
    count: 1 | 6;
    target?: AbilityKey;
  } | null>(null);
  const [rolledPool, setRolledPool] = useState<number[] | null>(null);

  const setScore = (key: AbilityKey, val: number, silent = false) => {
    setValue(SCORE_PATH[key], val as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (!silent) {
      log({
        kind: 'stat-manual',
        label: ABILITY_LABELS[key],
        detail: `${ABILITY_LABELS[key]} set to ${val}`,
      });
    }
  };

  const setMethod = (next: AbilityMethod) => {
    if (next === method) return;
    setValue('generation.abilityMethod', next, { shouldDirty: true });
    if (next !== 'roll') setRolledPool(null);
    // Give each guided method a clean slate so nothing looks pre-assigned.
    if (next === 'pointbuy') {
      ABILITY_KEYS.forEach(k =>
        setValue(SCORE_PATH[k], POINT_BUY_MIN as never, { shouldDirty: true })
      );
    } else if (next === 'standard' || next === 'roll') {
      ABILITY_KEYS.forEach(k =>
        setValue(SCORE_PATH[k], 1 as never, { shouldDirty: true })
      );
    }
    log({
      kind: 'method',
      label: 'Ability scores',
      detail: `Generation method: ${METHOD_TABS.find(t => t.key === next)?.label ?? next}`,
    });
  };

  const spent = pointBuySpent(scores);
  const remaining = POINT_BUY_BUDGET - spent;

  const applyRoll = (results: Roll4d6Result[]) => {
    if (overlay?.count === 1 && overlay.target) {
      const r = results[0];
      const key = overlay.target;
      setValue(SCORE_PATH[key], r.total as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
      log({
        kind: 'stat-roll',
        label: ABILITY_LABELS[key],
        detail: `${ABILITY_LABELS[key]}: rolled 4d6 [${r.rolls.join(', ')}], dropped ${r.rolls[r.dropIndex]} → ${r.total}`,
        rolls: r.rolls,
        append: true,
      });
    } else {
      const totals = results.map(r => r.total).sort((a, b) => b - a);
      setRolledPool(totals);
      results.forEach((r, i) => {
        log({
          kind: 'stat-roll',
          label: `Set die ${i + 1}`,
          detail: `Rolled 4d6 [${r.rolls.join(', ')}], dropped ${r.rolls[r.dropIndex]} → ${r.total}`,
          rolls: r.rolls,
          append: true,
        });
      });
    }
  };

  /* ---- assignment (standard array + rolled pool) ------------------- */
  const assignValues =
    method === 'standard' ? [...STANDARD_ARRAY] : (rolledPool ?? []);

  const assignmentBody = (values: number[]) => {
    const pool = [...values];
    const remainingValues = [...values];
    ABILITY_KEYS.forEach(k => {
      const s = sheet?.abilities?.[k]?.score ?? 0;
      const idx = remainingValues.indexOf(s);
      if (idx >= 0) remainingValues.splice(idx, 1);
    });

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.1em] text-ink-subtle">
            Unassigned
          </span>
          {remainingValues.length === 0 ? (
            <span className="text-sm text-success">All assigned ✓</span>
          ) : (
            remainingValues.map((v, i) => (
              <span
                key={i}
                className="rounded-md border border-gold/50 bg-surface px-2 py-0.5 font-display text-sm tabular-nums text-gold-strong"
              >
                {v}
              </span>
            ))
          )}
          <Button
            size="sm"
            variant="flat"
            className="ml-auto"
            onPress={() => {
              const sorted = [...pool].sort((a, b) => b - a);
              ABILITY_KEYS.forEach((k, i) => {
                const val = sorted[i] ?? POINT_BUY_MIN;
                setValue(SCORE_PATH[k], val as never, { shouldDirty: true });
                log({
                  kind: method === 'standard' ? 'stat-standard' : 'stat-roll',
                  label: ABILITY_LABELS[k],
                  detail: `${ABILITY_LABELS[k]} = ${val} (auto-assigned, ${method === 'standard' ? 'standard array' : 'rolled set'})`,
                });
              });
            }}
          >
            Auto-assign
          </Button>
        </div>

        <div className="space-y-2">
          {ABILITY_KEYS.map(key => {
            const current = sheet?.abilities?.[key]?.score ?? 0;
            // Keep duplicates — rolled sets legitimately repeat values.
            const options = [...values].sort((a, b) => b - a);
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-md border border-line bg-surface-2 px-3 py-2"
              >
                <span className="w-28 font-display-alt text-xs uppercase tracking-[0.12em] text-ink-muted">
                  {ABILITY_LABELS[key]}
                </span>
                <select
                  className="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                  value={values.includes(current) ? String(current) : ''}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (!val) return;
                    setValue(SCORE_PATH[key], val as never, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    log({
                      kind:
                        method === 'standard' ? 'stat-standard' : 'stat-roll',
                      label: ABILITY_LABELS[key],
                      detail: `${ABILITY_LABELS[key]} = ${val} (${method === 'standard' ? 'standard array' : 'assigned from rolled set'})`,
                    });
                  }}
                >
                  <option value="">—</option>
                  {options.map((v, oi) => (
                    <option key={`${v}-${oi}`} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <span className="w-16 text-right text-sm text-ink-muted tabular-nums">
                  mod {fmtBonus(abilityModifier(current))}
                </span>
              </div>
            );
          })}
        </div>
        {method === 'roll' && (
          <p className="text-xs text-ink-subtle">
            Re-roll the set to replace these values. Manual edits stay in your
            log.
          </p>
        )}
      </div>
    );
  };

  return (
    <SectionCard framed title="Ability Scores" bodyClassName="space-y-4">
      <Tabs
        aria-label="Ability score method"
        size="sm"
        selectedKey={method}
        onSelectionChange={k => setMethod(k as AbilityMethod)}
        classNames={{ tabList: 'bg-surface-2' }}
      >
        {METHOD_TABS.map(t => (
          <Tab key={t.key} title={t.label} />
        ))}
      </Tabs>

      <p className="text-sm text-ink-muted">{METHOD_BLURB[method]}</p>

      {method === 'pointbuy' && (
        <div className="rounded-[var(--radius-card)] border border-gold/30 bg-surface-2 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-display-alt uppercase tracking-[0.12em] text-ink-muted">
              Points
            </span>
            <span
              className={`font-display text-lg tabular-nums ${
                remaining < 0 ? 'text-danger' : 'text-ink'
              }`}
            >
              {remaining} left
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-all ${
                remaining < 0 ? 'bg-danger' : 'bg-gold'
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, (spent / POINT_BUY_BUDGET) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {method === 'manual' && (
        <div className="space-y-4">
          {ABILITY_KEYS.map((ability, i) => (
            <AbilityRow
              key={ability}
              ability={ability}
              score={scores[i]}
              pb={pb}
              proficient={sheet?.abilities?.[ability]?.proficientSave ?? false}
              control={control}
            >
              <SheetNumber
                control={control}
                name={`abilities.${ability}.score`}
                label="Score"
                min={1}
                max={30}
              />
            </AbilityRow>
          ))}
          <p className="text-xs text-ink-subtle">
            Tip: switch to another tab for guided generation. Manual entries are
            always allowed and always logged.
          </p>
        </div>
      )}

      {method === 'pointbuy' && (
        <div className="space-y-3">
          {ABILITY_KEYS.map((key, i) => {
            const score = scores[i];
            const cost = pointBuyCost(score);
            const canInc =
              score < POINT_BUY_MAX &&
              (pointBuyCost(score + 1) ?? 99) - (cost ?? 0) <= remaining;
            const canDec = score > POINT_BUY_MIN;
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-md border border-line bg-surface-2 px-3 py-2"
              >
                <span className="w-28 font-display-alt text-xs uppercase tracking-[0.12em] text-ink-muted">
                  {ABILITY_LABELS[key]}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    isDisabled={!canDec}
                    onPress={() => setScore(key, score - 1)}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center font-display text-lg tabular-nums text-ink">
                    {score}
                  </span>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    isDisabled={!canInc}
                    onPress={() => setScore(key, score + 1)}
                  >
                    +
                  </Button>
                </div>
                <span className="text-xs text-ink-subtle">
                  {cost === null ? 'out of range' : `${cost} pts`}
                </span>
                <span className="ml-auto text-sm text-ink-muted tabular-nums">
                  mod {fmtBonus(abilityModifier(score))}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {(method === 'standard' || (method === 'roll' && rolledPool)) &&
        assignmentBody(assignValues)}

      {method === 'roll' && (
        <div className="space-y-3">
          <Button
            variant="flat"
            className="w-full border border-gold/40"
            onPress={() => setOverlay({ count: 6 })}
          >
            🎲 Roll a full set (6 × 4d6 drop lowest)
          </Button>
          <div className="space-y-2">
            {ABILITY_KEYS.map((key, i) => (
              <div
                key={key}
                className="flex items-center gap-3 rounded-md border border-line bg-surface-2 px-3 py-2"
              >
                <span className="w-28 font-display-alt text-xs uppercase tracking-[0.12em] text-ink-muted">
                  {ABILITY_LABELS[key]}
                </span>
                <span className="w-10 text-center font-display text-lg tabular-nums text-ink">
                  {scores[i] <= 1 ? '—' : scores[i]}
                </span>
                <span className="text-sm text-ink-muted tabular-nums">
                  {scores[i] <= 1
                    ? 'not rolled'
                    : `mod ${fmtBonus(abilityModifier(scores[i]))}`}
                </span>
                <Button
                  size="sm"
                  variant="flat"
                  className="ml-auto"
                  onPress={() => setOverlay({ count: 1, target: key })}
                >
                  🎲 Roll
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <DiceRollOverlay
        open={overlay !== null}
        count={overlay?.count ?? 1}
        title={
          overlay?.count === 6
            ? 'Rolling a full set'
            : overlay?.target
              ? `Rolling ${ABILITY_LABELS[overlay.target]}`
              : 'Rolling 4d6'
        }
        onClose={() => setOverlay(null)}
        onApply={applyRoll}
      />
    </SectionCard>
  );
}
