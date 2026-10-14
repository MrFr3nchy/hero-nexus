'use client';

import { Button, NumberInput, Select, SelectItem, Switch } from '@heroui/react';

import {
  DEFAULT_RULES,
  DICE_TEMPLATES,
  DIE_SIDES,
  RULE_LIMITS,
  customAdvice,
  customLines,
  normalizeRules,
  type CrownsRules,
  type CustomDiceRules,
  type InstantKind,
  type LiarsDiceRules,
  type OpponentKind,
  type ScoreKind,
  type TavernKind,
  type TavernRules,
  type TurnKind,
  type WinKind,
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
  // Against the house the ante is the smallest bet, and a raise is your own.
  const vsHouse =
    kind === 'custom-dice' && (rules as CustomDiceRules).opponent === 'house';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <NumberInput
          size={size}
          label={vsHouse ? 'Smallest bet (gp)' : 'Ante, each round (gp)'}
          className="w-44"
          minValue={0}
          maxValue={RULE_LIMITS.anteCp.max / 100}
          step={0.1}
          value={gp(rules.anteCp)}
          onValueChange={v => set({ anteCp: cp(v) })}
        />
        <NumberInput
          size={size}
          label={vsHouse ? 'Most a bet may add (gp)' : 'Largest raise (gp)'}
          className="w-44"
          minValue={0}
          maxValue={RULE_LIMITS.raiseCapCp.max / 100}
          step={0.5}
          value={gp(rules.raiseCapCp)}
          onValueChange={v => set({ raiseCapCp: cp(v) })}
        />
      </div>
      {kind === 'custom-dice' && (
        <DiceGameFields
          rules={rules as CustomDiceRules}
          onChange={onChange}
          size={size}
        />
      )}
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
      ) : kind === 'crowns' ? (
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
      ) : null}
    </div>
  );
}

const TURN_LABEL: Record<TurnKind, string> = {
  'one-roll': 'One roll',
  hold: 'Keep some, reroll the rest',
  push: 'Push your luck',
};
const SCORE_LABEL: Record<ScoreKind, string> = {
  sum: 'The dice added up',
  highest: 'The highest die',
  'count-at-least': 'How many show N or more',
  'most-alike': 'Most dice alike',
  straight: 'Longest straight',
};
const WIN_LABEL: Record<WinKind, string> = {
  highest: 'Highest score',
  lowest: 'Lowest score',
  'closest-under': 'Closest to N, not over',
  exact: 'Exactly N',
  'first-to': 'First to N points',
};
const INSTANT_LABEL: Record<InstantKind, string> = {
  none: 'No instant win',
  'all-max': 'Every die on its top face',
  'all-same': 'Every die alike',
};
const OPPONENT_LABEL: Record<OpponentKind, string> = {
  'each-other': 'Each other, for the pot',
  house: 'The house, at odds',
};

/**
 * Building a dice game from parts. Any combination is allowed; a template is
 * a starting point, the sentences below are what players will read, and a
 * word of advice appears when a combination plays strangely — never a
 * refusal. Every change is normalised at once, so the form only ever shows
 * rules the server would accept.
 */
function DiceGameFields({
  rules,
  onChange,
  size,
}: {
  rules: CustomDiceRules;
  onChange: (next: TavernRules) => void;
  size: 'sm' | 'md';
}) {
  const set = (patch: Partial<CustomDiceRules>) =>
    onChange(normalizeRules('custom-dice', { ...rules, ...patch }));
  const faces = Array.from({ length: rules.sides }, (_, i) => i + 1);
  const advice = customAdvice(rules);
  const pick = <T extends string>(
    label: string,
    value: T,
    options: Record<T, string>,
    onPick: (v: T) => void,
    width = 'w-56'
  ) => (
    <Select
      size={size}
      label={label}
      className={width}
      selectedKeys={[value]}
      onSelectionChange={k => {
        const next = Array.from(k)[0];
        if (next) onPick(String(next) as T);
      }}
    >
      {(Object.keys(options) as T[]).map(k => (
        <SelectItem key={k}>{options[k]}</SelectItem>
      ))}
    </Select>
  );
  const faceSelect = (
    label: string,
    value: number,
    onPick: (v: number) => void
  ) => (
    <Select
      size={size}
      label={label}
      className="w-36"
      selectedKeys={[String(value)]}
      onSelectionChange={k => onPick(Number(Array.from(k)[0] ?? 0))}
    >
      {[
        <SelectItem key="0">None</SelectItem>,
        ...faces.map(f => <SelectItem key={String(f)}>{`A ${f}`}</SelectItem>),
      ]}
    </Select>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Start from</span>
        <div className="flex flex-wrap gap-1.5">
          {DICE_TEMPLATES.map(t => (
            <Button
              key={t.key}
              size="sm"
              variant="bordered"
              title={t.line}
              onPress={() =>
                onChange(
                  normalizeRules('custom-dice', {
                    ...DEFAULT_RULES['custom-dice'],
                    anteCp: rules.anteCp,
                    raiseCapCp: rules.raiseCapCp,
                    ...t.rules,
                  })
                )
              }
            >
              {t.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <NumberInput
          size={size}
          label="Dice"
          className="w-28"
          minValue={RULE_LIMITS.count.min}
          maxValue={RULE_LIMITS.count.max}
          value={rules.count}
          onValueChange={v => set({ count: Number(v) || 1 })}
        />
        <Select
          size={size}
          label="Of"
          className="w-28"
          selectedKeys={[String(rules.sides)]}
          onSelectionChange={k => set({ sides: Number(Array.from(k)[0] ?? 6) })}
        >
          {DIE_SIDES.map(n => (
            <SelectItem key={String(n)}>{`d${n}`}</SelectItem>
          ))}
        </Select>
        {pick('A turn', rules.turn, TURN_LABEL, v => set({ turn: v }))}
        {rules.turn === 'hold' && (
          <NumberInput
            size={size}
            label="Rerolls"
            className="w-28"
            minValue={RULE_LIMITS.rerolls.min}
            maxValue={RULE_LIMITS.rerolls.max}
            value={rules.rerolls}
            onValueChange={v => set({ rerolls: Number(v) || 0 })}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {pick('Score', rules.score, SCORE_LABEL, v => set({ score: v }))}
        {rules.score === 'count-at-least' && (
          <NumberInput
            size={size}
            label="N"
            className="w-24"
            minValue={1}
            maxValue={rules.sides}
            value={rules.threshold}
            onValueChange={v => set({ threshold: Number(v) || 1 })}
          />
        )}
        {pick('Wins on', rules.winsOn, WIN_LABEL, v => set({ winsOn: v }))}
        {['closest-under', 'exact', 'first-to'].includes(rules.winsOn) && (
          <NumberInput
            size={size}
            label="N"
            className="w-24"
            minValue={RULE_LIMITS.customTarget.min}
            maxValue={RULE_LIMITS.customTarget.max}
            value={rules.target}
            onValueChange={v => set({ target: Number(v) || 1 })}
          />
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {faceSelect('Busts on', rules.bustFace, v => set({ bustFace: v }))}
        {faceSelect('Wild', rules.wildFace, v => set({ wildFace: v }))}
        {pick('Wins outright', rules.instantWin, INSTANT_LABEL, v =>
          set({ instantWin: v })
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {pick('Who you play', rules.opponent, OPPONENT_LABEL, v =>
          set({ opponent: v })
        )}
        {rules.opponent === 'house' && (
          <NumberInput
            size={size}
            label="A win pays N to 1"
            className="w-40"
            minValue={RULE_LIMITS.odds.min}
            maxValue={RULE_LIMITS.odds.max}
            value={rules.odds}
            onValueChange={v => set({ odds: Number(v) || 1 })}
          />
        )}
        <Switch
          size="sm"
          isSelected={rules.hidden}
          onValueChange={v => set({ hidden: v })}
        >
          <span className="text-sm">Dice under cups until the show</span>
        </Switch>
      </div>

      <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
        <span className="text-xs font-semibold">Players will read</span>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink-muted">
          {customLines(rules).map(l => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {advice && <p className="mt-1.5 text-xs text-warning">{advice}</p>}
      </div>
    </div>
  );
}
