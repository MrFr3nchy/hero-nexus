'use client';

import { useState } from 'react';
import { Button, Tab, Tabs } from '@heroui/react';

import { Dice3DRoller, type RollRequest } from '@/@shared/components/ui';
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  ROLL_MODES,
  STANDARD_ARRAY,
  pointBuyCost,
  pointBuySpent,
  specForMode,
  type RollMode,
  type RollResult,
} from '@/@shared/lib/dice';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type AbilityKey,
  type AbilityMethod,
} from '../schema';
import { abilityModifier, fmtBonus } from '../lib/derive';
import type { ProvenanceInput } from '../lib/provenance';

export type AbilityScores = Record<AbilityKey, number>;

interface AbilityScorePickerProps {
  /** The scores this control edits — base scores in a guided build. */
  scores: AbilityScores;
  onScores: (next: AbilityScores) => void;
  method: AbilityMethod;
  onMethod: (next: AbilityMethod) => void;
  rollMode: RollMode;
  onRollMode: (next: RollMode) => void;
  log: (input: ProvenanceInput) => void;
  /** Methods outside this list are disabled by the campaign's rules. */
  allowedMethods?: AbilityMethod[];
  /** Increases applied after this control — background boosts and ASIs. */
  bonuses?: Partial<AbilityScores>;
  /** Abilities whose saving throw the class makes you proficient in. */
  saves?: AbilityKey[];
  /** Manual save-proficiency toggles, for the hand-built sheet. */
  saveProficiencies?: Record<AbilityKey, boolean>;
  onToggleSave?: (ability: AbilityKey, next: boolean) => void;
}

const METHOD_TABS: { key: AbilityMethod; label: string }[] = [
  { key: 'pointbuy', label: 'Point buy' },
  { key: 'standard', label: 'Standard array' },
  { key: 'roll', label: 'Roll' },
  { key: 'manual', label: 'Type it in' },
];

const METHOD_BLURB: Record<AbilityMethod, string> = {
  pointbuy: `Spend ${POINT_BUY_BUDGET} points across the six abilities. Nothing starts below ${POINT_BUY_MIN} or above ${POINT_BUY_MAX}.`,
  standard: 'Hand out the fixed set 15, 14, 13, 12, 10, 8 — one value per ability.',
  roll: 'Throw the dice, then decide where each result goes. Every roll is written to your log.',
  manual: 'Type any score from 1 to 30. Useful when you are copying in an existing character.',
};

/**
 * The sheet schema will not store a score below 1, so an unassigned ability is
 * written as 1 and shown as a dash while a guided method is still placing
 * values. In "type it in" mode a 1 is taken at face value.
 */
const EMPTY = 1;

function describeRoll(result: RollResult): string {
  const notation = `${result.spec.count}d${result.spec.sides}`;
  if (result.droppedIndexes.length === 0) {
    return `rolled ${notation} [${result.dice.join(', ')}] = ${result.total}`;
  }
  const dropped = result.droppedIndexes.map(i => result.dice[i]).join(', ');
  return `rolled ${notation} [${result.dice.join(', ')}], dropped ${dropped} = ${result.total}`;
}

/** One ability tile: score, modifier, save, and whatever control the method needs. */
function AbilityTile({
  ability,
  score,
  bonus,
  save,
  unset,
  children,
  footer,
}: {
  ability: AbilityKey;
  score: number;
  bonus: number;
  save: { proficient: boolean; value: number } | null;
  unset: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const total = score + bonus;
  const empty = unset;
  return (
    <div className="relative rounded-[var(--radius-card)] border-2 border-line bg-surface-2 px-3 pb-3 pt-5">
      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-line bg-surface px-2 py-0.5 font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-muted">
        {ABILITY_LABELS[ability]}
      </span>

      <div className="flex items-baseline justify-center gap-2">
        <span className="font-display text-3xl tabular-nums text-ink">
          {empty ? '—' : total}
        </span>
        {bonus > 0 && !empty && (
          <span className="font-display-alt text-xs text-gold-strong">
            {score} +{bonus}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-center text-xs text-ink-muted">
        mod {empty ? '—' : fmtBonus(abilityModifier(total))}
        {save && (
          <>
            {' · '}save {fmtBonus(save.value)}
            {save.proficient && <span className="text-gold-strong"> ●</span>}
          </>
        )}
      </div>

      {children && <div className="mt-3">{children}</div>}
      {footer}
    </div>
  );
}

/**
 * The ability-score control, method tabs and all. It is deliberately
 * form-agnostic: the wizard points it at the build's base scores, the
 * hand-built sheet points it straight at the sheet. Only the numbers move.
 */
export function AbilityScorePicker({
  scores,
  onScores,
  method,
  onMethod,
  rollMode,
  onRollMode,
  log,
  allowedMethods,
  bonuses,
  saves,
  saveProficiencies,
  onToggleSave,
}: AbilityScorePickerProps) {
  const [request, setRequest] = useState<
    (RollRequest & { target?: AbilityKey }) | null
  >(null);
  const [pool, setPool] = useState<number[] | null>(null);

  const bonusFor = (key: AbilityKey) => bonuses?.[key] ?? 0;
  const proficiencyOf = (key: AbilityKey) =>
    saveProficiencies?.[key] ?? saves?.includes(key) ?? false;

  const methodAllowed = (m: AbilityMethod) =>
    !allowedMethods || allowedMethods.length === 0 || allowedMethods.includes(m);

  const setScore = (key: AbilityKey, value: number) =>
    onScores({ ...scores, [key]: value });

  // While a set is being handed out, a score of 1 means "not placed yet".
  const placing = method === 'standard' || method === 'roll';

  const spent = pointBuySpent(ABILITY_KEYS.map(k => scores[k]));
  const remaining = POINT_BUY_BUDGET - spent;

  const changeMethod = (next: AbilityMethod) => {
    if (next === method || !methodAllowed(next)) return;
    if (next !== 'roll') setPool(null);
    // Every guided method starts from a clean slate so nothing looks pre-set.
    if (next === 'pointbuy') {
      onScores(
        Object.fromEntries(
          ABILITY_KEYS.map(k => [k, POINT_BUY_MIN])
        ) as AbilityScores
      );
    } else if (next === 'standard' || next === 'roll') {
      onScores(
        Object.fromEntries(ABILITY_KEYS.map(k => [k, EMPTY])) as AbilityScores
      );
    }
    onMethod(next);
  };

  const fireRoll = (groups: number, target?: AbilityKey) =>
    setRequest({
      nonce: Date.now(),
      spec: specForMode(rollMode),
      groups,
      title: target ? `Rolling ${ABILITY_LABELS[target]}` : 'Rolling a full set',
      hint: rollMode === '3d6' ? 'three d6, keep them all' : 'four d6, drop the lowest',
      target,
    });

  const handleResults = (
    results: RollResult[],
    req: RollRequest & { target?: AbilityKey }
  ) => {
    if (req.target && results.length === 1) {
      const [result] = results;
      setScore(req.target, result.total);
      log({
        kind: 'stat-roll',
        label: ABILITY_LABELS[req.target],
        detail: `${ABILITY_LABELS[req.target]}: ${describeRoll(result)}`,
        rolls: result.dice,
        append: true,
      });
      return;
    }
    setPool(results.map(r => r.total).sort((a, b) => b - a));
    results.forEach((result, i) => {
      log({
        kind: 'stat-roll',
        label: `Set die ${i + 1}`,
        detail: describeRoll(result),
        rolls: result.dice,
        append: true,
      });
    });
  };

  /* ---- value assignment (standard array + a rolled set) ------------ */

  const assignable = method === 'standard' ? [...STANDARD_ARRAY] : (pool ?? []);

  const unassigned = (() => {
    const left = [...assignable];
    for (const key of ABILITY_KEYS) {
      const at = left.indexOf(scores[key]);
      if (scores[key] > EMPTY && at >= 0) left.splice(at, 1);
    }
    return left;
  })();

  const assign = (key: AbilityKey, value: number) => {
    setScore(key, value);
    log({
      kind: method === 'standard' ? 'stat-standard' : 'stat-roll',
      label: ABILITY_LABELS[key],
      detail: `${ABILITY_LABELS[key]} = ${value} (${
        method === 'standard' ? 'standard array' : 'assigned from the rolled set'
      })`,
    });
  };

  const autoAssign = () => {
    const sorted = [...assignable].sort((a, b) => b - a);
    const next = { ...scores };
    ABILITY_KEYS.forEach((key, i) => {
      next[key] = sorted[i] ?? EMPTY;
    });
    onScores(next);
    log({
      kind: method === 'standard' ? 'stat-standard' : 'stat-roll',
      label: 'Ability scores',
      detail: `Auto-assigned ${sorted.join(', ')} in order, highest first.`,
    });
  };

  const assignmentControls = (key: AbilityKey) => (
    <div className="flex flex-wrap justify-center gap-1">
      {assignable.map((value, i) => {
        const taken = scores[key] === value;
        const available = unassigned.includes(value) || taken;
        return (
          <button
            key={`${value}-${i}`}
            type="button"
            disabled={!available}
            onClick={() => assign(key, taken ? EMPTY : value)}
            className={`min-w-8 rounded-md border px-1.5 py-0.5 text-xs tabular-nums transition-colors ${
              taken
                ? 'border-gold bg-gold/20 text-gold-strong'
                : available
                  ? 'border-line bg-surface text-ink-muted hover:border-gold/60 hover:text-ink'
                  : 'cursor-not-allowed border-line/60 text-ink-subtle/50'
            }`}
          >
            {value}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs
        aria-label="Ability score method"
        size="sm"
        selectedKey={method}
        onSelectionChange={k => changeMethod(k as AbilityMethod)}
        disabledKeys={METHOD_TABS.map(t => t.key).filter(k => !methodAllowed(k))}
        classNames={{ tabList: 'bg-surface-2' }}
      >
        {METHOD_TABS.map(tab => (
          <Tab key={tab.key} title={tab.label} />
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

      {method === 'roll' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display-alt text-xs uppercase tracking-[0.12em] text-ink-subtle">
              Dice
            </span>
            <div className="inline-flex overflow-hidden rounded-md border border-line">
              {ROLL_MODES.map(m => (
                <button
                  key={m.key}
                  type="button"
                  title={m.hint}
                  onClick={() => onRollMode(m.key)}
                  className={`px-3 py-1 text-xs transition-colors ${
                    rollMode === m.key
                      ? 'bg-gold/15 text-gold-strong'
                      : 'bg-surface-2 text-ink-muted hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="flat"
              className="ml-auto border border-gold/40"
              onPress={() => fireRoll(6)}
            >
              Roll a full set of six
            </Button>
          </div>

          <Dice3DRoller
            request={request}
            onResults={handleResults}
            onClose={() => setRequest(null)}
          />
        </div>
      )}

      {(method === 'standard' || (method === 'roll' && pool)) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm">
          <span className="font-display-alt text-xs uppercase tracking-[0.12em] text-ink-subtle">
            Unassigned
          </span>
          {unassigned.length === 0 ? (
            <span className="text-success">every value placed</span>
          ) : (
            unassigned.map((v, i) => (
              <span
                key={i}
                className="rounded-md border border-gold/50 bg-surface px-2 py-0.5 font-display text-sm tabular-nums text-gold-strong"
              >
                {v}
              </span>
            ))
          )}
          <Button size="sm" variant="light" className="ml-auto" onPress={autoAssign}>
            Auto-assign
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
        {ABILITY_KEYS.map(key => {
          const score = scores[key];
          const bonus = bonusFor(key);
          const proficient = proficiencyOf(key);
          const mod = abilityModifier(score + bonus);
          const cost = pointBuyCost(score);
          const canRaise =
            score < POINT_BUY_MAX &&
            (pointBuyCost(score + 1) ?? 99) - (cost ?? 0) <= remaining;

          return (
            <AbilityTile
              key={key}
              ability={key}
              score={score}
              bonus={bonus}
              unset={placing && score <= EMPTY}
              save={{ proficient, value: proficient ? mod + 2 : mod }}
              footer={
                onToggleSave ? (
                  <label className="mt-2 flex items-center justify-center gap-1.5 text-[0.7rem] text-ink-subtle">
                    <input
                      type="checkbox"
                      checked={proficient}
                      onChange={e => onToggleSave(key, e.target.checked)}
                    />
                    save proficiency
                  </label>
                ) : null
              }
            >
              {method === 'pointbuy' && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    isDisabled={score <= POINT_BUY_MIN}
                    onPress={() => setScore(key, score - 1)}
                    aria-label={`Lower ${ABILITY_LABELS[key]}`}
                  >
                    −
                  </Button>
                  <span className="w-10 text-center text-xs text-ink-subtle">
                    {cost === null ? '—' : `${cost} pt`}
                  </span>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    isDisabled={!canRaise}
                    onPress={() => setScore(key, score + 1)}
                    aria-label={`Raise ${ABILITY_LABELS[key]}`}
                  >
                    +
                  </Button>
                </div>
              )}

              {method === 'manual' && (
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={score}
                  onChange={e => setScore(key, Number(e.target.value) || EMPTY)}
                  className="w-full rounded-md border border-line bg-surface px-2 py-1 text-center text-sm tabular-nums text-ink"
                  aria-label={ABILITY_LABELS[key]}
                />
              )}

              {method === 'standard' && assignmentControls(key)}

              {method === 'roll' &&
                (pool ? (
                  assignmentControls(key)
                ) : (
                  <Button
                    size="sm"
                    variant="flat"
                    className="w-full"
                    onPress={() => fireRoll(1, key)}
                  >
                    Roll
                  </Button>
                ))}
            </AbilityTile>
          );
        })}
      </div>

      {method === 'roll' && pool && (
        <p className="text-xs text-ink-subtle">
          Roll the set again to replace these values — the old ones stay in your log.
        </p>
      )}
    </div>
  );
}
