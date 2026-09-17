'use client';

import { Button, Tooltip } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';

import {
  useSelectedToken,
  useSelectedTokens,
} from '@/@shared/battlemap/selection';
import { useDiceTray } from '@/@shared/components/dice';
import { Marginalia } from '@/@shared/components/ui';
import { StatBlock } from '@/@shared/components/StatBlock';
import {
  parseContentData,
  type ContentEntry,
  type CreatureData,
} from '@/@shared/content';
import { withAdvantage } from '@/@shared/lib/dice';
import type { LiveState } from '@/server/session';
import { rollAction } from '../../actions';
import { legendaryLeft } from '../../lib/monsters';
import {
  spendLegendaryActionAction,
  spendRechargeFeatureAction,
} from '../../monster-actions';
import { attackAction } from '../../fight-actions';
import { outcomeWords, type RollOutcome } from '@/@creator/campaign/lib/attack';
import { Refused, type RefusedState } from '../Refused';
import { getEntryCreatureAction } from '../../fight-actions';

/**
 * What a monster's action says it does, read off its prose.
 *
 * Stat blocks are written for people: "Melee Attack Roll: +9, reach 10 ft.
 * Hit: 12 (2d6 + 5) Bludgeoning damage." The bonus and the dice are in there
 * and this pulls them out — the 2024 and 2014 phrasings both — so a DM has a
 * button rather than a calculator. When a line has neither, it is prose and
 * stays prose.
 */
function rollsIn(desc: string): { hit: string | null; damage: string[] } {
  const hitMatch =
    /(?:Attack Roll|to hit)[^+\-\d]*([+\-]\s?\d+)/i.exec(desc) ??
    /([+\-]\s?\d+)\s+to hit/i.exec(desc);
  const hit = hitMatch ? `1d20${hitMatch[1].replace(/\s/g, '')}` : null;
  const damage: string[] = [];
  const re = /\((\d+d\d+(?:\s?[+\-]\s?\d+)?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc))) damage.push(m[1].replace(/\s/g, ''));
  return { hit, damage };
}

/**
 * The selected foe, as the bestiary has it. Staff only.
 *
 * Reference, never copy: the block is resolved through `resolveContentRefs`
 * from the ref the entry remembers, so a homebrew monster corrected in the
 * library is corrected here. Its actions carry roll buttons where the prose
 * gives a bonus or dice; rolls go through `rollAction` as the creature, and
 * the tray draws the server's faces.
 */
export function StatBlockPanel({
  campaignId,
  state,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  onError: (message: string) => void;
}) {
  const selectedId = useSelectedToken(campaignId);
  const selectedIds = useSelectedTokens(campaignId);
  const [entry, setEntry] = useState<ContentEntry | null | undefined>(
    undefined
  );
  const [mode, setMode] = useState<'flat' | 'advantage' | 'disadvantage'>(
    'flat'
  );
  const tray = useDiceTray();

  const combatant = useMemo(() => {
    const token = state.battlemap?.tokens.find(t => t.id === selectedId);
    if (!token?.entryId) return null;
    return state.entries.find(e => e.id === token.entryId) ?? null;
  }, [state.battlemap, state.entries, selectedId]);

  useEffect(() => {
    if (!combatant) {
      setEntry(undefined);
      return;
    }
    if (!combatant.creatureRef) {
      setEntry(null);
      return;
    }
    let live = true;
    setEntry(undefined);
    getEntryCreatureAction(combatant.id).then(e => {
      if (live) setEntry(e);
    });
    return () => {
      live = false;
    };
  }, [combatant]);

  const [refusal, setRefusal] = useState<RefusedState | null>(null);
  const [last, setLast] = useState<{
    name: string;
    outcome: RollOutcome;
    total: number;
  } | null>(null);

  /*
   * The target: a second token shift-selected on the board. The first is the
   * attacker — the block being read — so the other one is who it swings at;
   * with none, the swing rolls and compares nothing, as it always did.
   */
  const targetEntryId = useMemo(() => {
    const other = selectedIds.find(id => id !== selectedId);
    const token = other
      ? state.battlemap?.tokens.find(t => t.id === other)
      : null;
    return token?.entryId ?? null;
  }, [selectedIds, selectedId, state.battlemap]);
  const targetLabel = useMemo(
    () => state.entries.find(e => e.id === targetEntryId)?.label ?? null,
    [state.entries, targetEntryId]
  );

  /**
   * A to-hit from the block goes through `attack` (06): the creature's
   * action is spent (05), the die compared against the target's AC when one
   * is picked, the damage rolled and adjusted, and — for a foe swinging at
   * a hero — proposed for the hero's player or the DM to land. Under
   * Enforce a spent slot refuses and the DM may rule past. Damage alone
   * still rolls through the log as before.
   */
  const swing = async (name: string, ruling = false) => {
    if (!combatant) return;
    const res = await attackAction({
      attackerEntryId: combatant.id,
      weapon: { kind: 'creature-action', name },
      targetEntryId,
      mode,
      ruling,
    });
    if (!res.ok) {
      if (res.overridable) {
        setRefusal({ message: res.error, ruling: () => swing(name, true) });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefusal(null);
    const { hit, damage, outcome } = res.data;
    setLast({ name, outcome, total: hit.total });
    const at = targetLabel ? ` vs ${targetLabel}` : '';
    await tray.showNotationRoll(hit, {
      title: combatant.label,
      hint: `${name} · to hit${at}${
        outcome.hit === true ? ' · hit' : outcome.hit === false ? ' · miss' : ''
      }`,
    });
    if (damage) {
      await tray.showNotationRoll(damage, {
        title: combatant.label,
        hint: `${name} · damage${at}`,
      });
    }
  };

  const roll = async (name: string, notation: string, what: string) => {
    if (!combatant) return;
    const finished =
      what === 'to hit' && mode !== 'flat'
        ? withAdvantage(notation, mode)
        : notation;
    const res = await rollAction(campaignId, {
      notation: finished,
      label: `${combatant.label} · ${name} · ${what}`.slice(0, 80),
      characterId: null,
      visibility: 'table',
    });
    if (!res.ok) {
      onError(res.error ?? 'The dice did not land.');
      return;
    }
    await tray.showNotationRoll(res.data, {
      title: combatant.label,
      hint: `${name} · ${what}`,
    });
  };

  if (!combatant) {
    return <Marginalia dash>tap a foe on the board</Marginalia>;
  }
  if (entry === undefined) {
    return (
      <p className="py-1 text-xs text-ink-subtle">Opening the bestiary…</p>
    );
  }
  if (entry === null) {
    return (
      <p className="py-1 text-xs text-ink-subtle">
        {combatant.label} was typed in by hand — there is no block behind it.
      </p>
    );
  }

  const data = parseContentData('creature', entry.data) as CreatureData;
  const groups: {
    title: string;
    legendary?: boolean;
    items: { name: string; desc: string; cost?: number; recharge?: number }[];
  }[] = [
    { title: 'Actions', items: data.actions },
    { title: 'Bonus actions', items: data.bonus_actions },
    { title: 'Reactions', items: data.reactions },
    { title: 'Legendary', items: data.legendary_actions, legendary: true },
  ].filter(g => g.items.length > 0);
  const legendaryLeftNow = combatant.legendary
    ? legendaryLeft(combatant.legendary.actions)
    : 0;
  const recharge = combatant.turn.recharge ?? {};

  // Take a legendary action (11): spends the creature's uses, never the
  // action slot. Use a recharge ability: spends the die.
  const takeLegendary = async (name: string, cost: number, ruling = false) => {
    const res = await spendLegendaryActionAction(combatant.id, cost, {
      ruling,
    });
    if (!res.ok) {
      if (res.overridable) {
        setRefusal({
          message: res.error,
          ruling: () => takeLegendary(name, cost, true),
        });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefusal(null);
  };
  const spendRecharge = async (name: string, ruling = false) => {
    const res = await spendRechargeFeatureAction(combatant.id, name, {
      ruling,
    });
    if (!res.ok) {
      if (res.overridable) {
        setRefusal({
          message: res.error,
          ruling: () => spendRecharge(name, true),
        });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefusal(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-ink">{combatant.label}</span>
        {combatant.hpCurrent !== null && (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {combatant.hpCurrent}/{combatant.hpMax} hp · ac{' '}
            {combatant.armorClass}
          </span>
        )}
        {data.spell_save_dc > 0 && (
          <Tooltip content="Read off the block. Ask the save at this DC from the Asking.">
            <span className="text-xs text-arcane">
              spell save DC {data.spell_save_dc}
              {data.spell_attack_bonus !== 0 &&
                ` · ${data.spell_attack_bonus > 0 ? '+' : ''}${data.spell_attack_bonus} spell attack`}
            </span>
          </Tooltip>
        )}
        <div className="ml-auto inline-flex rounded-md border border-line bg-surface-2 p-0.5">
          {(['disadvantage', 'flat', 'advantage'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-1.5 py-0.5 text-[0.65rem] ${
                mode === m
                  ? 'bg-gold font-medium text-bg'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {m === 'flat' ? 'str' : m === 'advantage' ? 'adv' : 'dis'}
            </button>
          ))}
        </div>
      </div>

      <Marginalia dash>
        {targetLabel
          ? `swinging at ${targetLabel}`
          : 'shift-tap a second token to aim'}
      </Marginalia>
      {refusal && (
        <Refused refusal={refusal} onDismiss={() => setRefusal(null)} />
      )}

      {groups.map(g => (
        <div key={g.title}>
          <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-subtle">
            {g.title}
          </p>
          <ul className="divide-y divide-line">
            {g.items.map(a => {
              const r = rollsIn(a.desc);
              return (
                <li key={a.name} className="py-1">
                  <p className="text-xs text-ink">
                    <span className="font-medium">{a.name}.</span>{' '}
                    {g.legendary && combatant.legendary && (
                      <button
                        type="button"
                        onClick={() => takeLegendary(a.name, a.cost ?? 1)}
                        className={`mr-1 rounded-sm border px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] ${
                          legendaryLeftNow >= (a.cost ?? 1)
                            ? 'border-arcane/50 text-arcane hover:bg-arcane/10'
                            : 'border-line text-ink-subtle'
                        }`}
                      >
                        {a.cost && a.cost > 1 ? `costs ${a.cost}` : 'take'} ·{' '}
                        {legendaryLeftNow} left
                      </button>
                    )}
                    {recharge[a.name] && (
                      <button
                        type="button"
                        onClick={() => spendRecharge(a.name)}
                        className={`mr-1 rounded-sm border px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] ${
                          recharge[a.name].ready
                            ? 'border-danger/50 text-danger hover:bg-danger/10'
                            : 'border-line text-ink-subtle'
                        }`}
                      >
                        {recharge[a.name].ready
                          ? `ready · recharge ${recharge[a.name].min}${
                              recharge[a.name].min < 6 ? '–6' : ''
                            }`
                          : 'spent — a d6 at its turn'}
                      </button>
                    )}
                    <span className="text-ink-muted">{a.desc}</span>
                  </p>
                  {last?.name === a.name && (
                    <p
                      className={`mt-0.5 text-xs ${
                        last.outcome.hit === true
                          ? 'text-success'
                          : last.outcome.hit === false
                            ? 'text-danger'
                            : 'text-ink-muted'
                      }`}
                    >
                      {last.outcome.targetLabel
                        ? `${last.outcome.targetLabel} · `
                        : ''}
                      {outcomeWords(last.outcome, last.total)}
                      {last.outcome.applied ? ' · applied' : ''}
                    </p>
                  )}
                  {(r.hit || r.damage.length > 0) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.hit && (
                        <Button
                          size="sm"
                          color="primary"
                          className="h-6 min-w-0 px-2 text-xs"
                          onPress={() => swing(a.name)}
                        >
                          Attack {r.hit.replace('1d20', '')}
                        </Button>
                      )}
                      {r.damage.map((d, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant="flat"
                          className="h-6 min-w-0 px-2 font-mono text-xs"
                          onPress={() => roll(a.name, d, 'damage')}
                        >
                          {d}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <details className="text-xs">
        <summary className="cursor-pointer text-ink-subtle">
          The whole block
        </summary>
        <div className="mt-2">
          <StatBlock entry={entry} headless showSource={false} />
        </div>
      </details>
    </div>
  );
}
