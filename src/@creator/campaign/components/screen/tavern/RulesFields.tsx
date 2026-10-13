'use client';

import { NumberInput, Switch } from '@heroui/react';

import {
  RULE_LIMITS,
  type CrownsRules,
  type LiarsDiceRules,
  type TavernKind,
  type TavernRules,
} from '@/@creator/campaign/lib/tavern';

/**
 * The settings a house can change, for one kind of tavern game. Coin is set
 * in gold and stored in copper. The server clamps every field again
 * (`normalizeRules`), so these limits are a courtesy, not the guard.
 */
export function RulesFields({
  kind,
  rules,
  onChange,
  size = 'sm',
}: {
  kind: TavernKind;
  rules: TavernRules;
  onChange: (next: TavernRules) => void;
  size?: 'sm' | 'md';
}) {
  const set = (patch: Partial<LiarsDiceRules & CrownsRules>) =>
    onChange({ ...rules, ...patch } as TavernRules);
  const gp = (cp: number) => Math.round(cp) / 100;
  const cp = (v: number) => Math.max(0, Math.round((Number(v) || 0) * 100));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <NumberInput
          size={size}
          label="Ante, each round (gp)"
          className="w-44"
          minValue={0}
          maxValue={RULE_LIMITS.anteCp.max / 100}
          step={0.1}
          value={gp(rules.anteCp)}
          onValueChange={v => set({ anteCp: cp(v) })}
        />
        <NumberInput
          size={size}
          label="Most one raise adds (gp)"
          className="w-44"
          minValue={0}
          maxValue={RULE_LIMITS.raiseCapCp.max / 100}
          step={0.5}
          value={gp(rules.raiseCapCp)}
          onValueChange={v => set({ raiseCapCp: cp(v) })}
        />
      </div>
      {kind === 'liars-dice' ? (
        <div className="flex flex-wrap items-center gap-3">
          <NumberInput
            size={size}
            label="Dice in each cup"
            className="w-36"
            minValue={RULE_LIMITS.dicePerCup.min}
            maxValue={RULE_LIMITS.dicePerCup.max}
            value={(rules as LiarsDiceRules).dicePerCup}
            onValueChange={v => set({ dicePerCup: Number(v) || 5 })}
          />
          <Switch
            size="sm"
            isSelected={(rules as LiarsDiceRules).onesWild}
            onValueChange={v => set({ onesWild: v })}
          >
            <span className="text-sm">Ones are wild</span>
          </Switch>
          <Switch
            size="sm"
            isSelected={(rules as LiarsDiceRules).spotOn}
            onValueChange={v => set({ spotOn: v })}
          >
            <span className="text-sm">Spot on may be called</span>
          </Switch>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <NumberInput
            size={size}
            label="Best hand at or under"
            className="w-40"
            minValue={RULE_LIMITS.target.min}
            maxValue={RULE_LIMITS.target.max}
            value={(rules as CrownsRules).target}
            onValueChange={v => set({ target: Number(v) || 31 })}
          />
          <NumberInput
            size={size}
            label="A crowned card counts ×"
            className="w-40"
            minValue={RULE_LIMITS.crownMultiplier.min}
            maxValue={RULE_LIMITS.crownMultiplier.max}
            value={(rules as CrownsRules).crownMultiplier}
            onValueChange={v => set({ crownMultiplier: Number(v) || 2 })}
          />
          <NumberInput
            size={size}
            label="Cards dealt"
            className="w-32"
            minValue={RULE_LIMITS.dealt.min}
            maxValue={RULE_LIMITS.dealt.max}
            value={(rules as CrownsRules).dealt}
            onValueChange={v => set({ dealt: Number(v) || 2 })}
          />
          <NumberInput
            size={size}
            label="Draws allowed"
            className="w-32"
            minValue={RULE_LIMITS.maxDraws.min}
            maxValue={RULE_LIMITS.maxDraws.max}
            value={(rules as CrownsRules).maxDraws}
            onValueChange={v => set({ maxDraws: Number(v) || 0 })}
          />
        </div>
      )}
    </div>
  );
}
