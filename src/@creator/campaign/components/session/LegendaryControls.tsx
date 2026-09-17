'use client';

import { Button, Tooltip } from '@heroui/react';
import { useState } from 'react';

import type { EntryRow } from '@/server/session';
import { legendaryLeft } from '../../lib/monsters';
import {
  setEntryGroupAction,
  setLairAction,
  spendLegendaryActionAction,
  spendLegendaryResistanceAction,
  spendRechargeFeatureAction,
} from '../../monster-actions';
import { Refused, type RefusedState } from '../Refused';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/**
 * Three pips and a die: what a legendary creature has left, on its row (11).
 *
 * Legendary actions are pips that empty as they are spent — tap one to
 * spend it — and fill again at the start of the creature's turn; Legendary
 * Resistance the same, filled again by a rest. A recharge ability is a dot
 * beside its name: filled is ready, hollow is spent, and the d6 at the
 * start of the creature's turn is what fills it. The lair is a switch; on,
 * a "Lair" row sits at 20.
 *
 * Staff only. A player's tracker never mounts this: the counters are the
 * DM's, and a player learning a lich has one resistance left is a leak.
 */
export function LegendaryControls({
  entry,
  act,
  onError,
}: {
  entry: EntryRow;
  act: Act;
  onError: (message: string) => void;
}) {
  const [refused, setRefused] = useState<RefusedState | null>(null);
  const leg = entry.legendary;
  const recharge = entry.turn.recharge ?? {};
  const rechargeNames = Object.keys(recharge);
  if (!leg && rechargeNames.length === 0) return null;

  const spendAction = async (ruling = false) => {
    const res = await spendLegendaryActionAction(entry.id, 1, { ruling });
    if (!res.ok) {
      if (res.overridable) {
        setRefused({ message: res.error, ruling: () => spendAction(true) });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefused(null);
    await act(Promise.resolve({ ok: true }));
  };

  const spendFeature = async (name: string, ruling = false) => {
    const res = await spendRechargeFeatureAction(entry.id, name, { ruling });
    if (!res.ok) {
      if (res.overridable) {
        setRefused({
          message: res.error,
          ruling: () => spendFeature(name, true),
        });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefused(null);
    await act(Promise.resolve({ ok: true }));
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {leg && leg.actions.max > 0 && (
        <Pips
          label="Legendary"
          max={leg.actions.max}
          left={legendaryLeft(leg.actions)}
          tone="arcane"
          hint="Legendary actions left. Tap to spend one; back to full at the start of its turn."
          onSpend={() => spendAction()}
        />
      )}
      {leg && leg.resistances.max > 0 && (
        <Pips
          label="Resistance"
          max={leg.resistances.max}
          left={legendaryLeft(leg.resistances)}
          tone="gold"
          hint="Legendary Resistance left today. Tap to choose to succeed instead."
          onSpend={() => act(spendLegendaryResistanceAction(entry.id))}
        />
      )}
      {rechargeNames.map(name => {
        const r = recharge[name];
        return (
          <Tooltip
            key={name}
            content={
              r.ready
                ? `${name} is ready. Tap to use it; recharges on a ${r.min}${
                    r.min < 6 ? '–6' : ''
                  }.`
                : `${name} is spent. A d6 at the start of its turn: ${r.min}${
                    r.min < 6 ? '–6' : ''
                  } readies it.`
            }
          >
            <button
              type="button"
              onClick={() => spendFeature(name)}
              className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] ${
                r.ready
                  ? 'border-danger/40 text-danger hover:bg-danger/10'
                  : 'border-line text-ink-subtle'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full border ${
                  r.ready ? 'border-danger bg-danger' : 'border-ink-subtle'
                }`}
              />
              {name}
            </button>
          </Tooltip>
        );
      })}
      {leg && (leg.actions.max > 0 || leg.resistances.max > 0) && (
        <Tooltip
          content={
            leg.lair
              ? 'The lair fights: a Lair row at 20. Tap to take it out.'
              : 'Let the lair fight: a Lair row at initiative 20, losing ties.'
          }
        >
          <Button
            size="sm"
            variant={leg.lair ? 'flat' : 'light'}
            className={`h-6 min-w-0 px-1.5 text-[0.65rem] ${
              leg.lair ? 'text-arcane' : 'text-ink-subtle'
            }`}
            onPress={() => act(setLairAction(entry.id, !leg.lair))}
          >
            Lair
          </Button>
        </Tooltip>
      )}
      {refused && (
        <div className="basis-full">
          <Refused refusal={refused} onDismiss={() => setRefused(null)} />
        </div>
      )}
    </div>
  );
}

function Pips({
  label,
  max,
  left,
  tone,
  hint,
  onSpend,
}: {
  label: string;
  max: number;
  left: number;
  tone: 'arcane' | 'gold';
  hint: string;
  onSpend: () => void;
}) {
  const on =
    tone === 'arcane' ? 'border-arcane bg-arcane' : 'border-gold bg-gold';
  return (
    <Tooltip content={hint}>
      <button
        type="button"
        onClick={onSpend}
        disabled={left === 0}
        aria-label={`${label}: ${left} of ${max} left`}
        className="inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] text-ink-subtle hover:bg-surface-2 disabled:opacity-60"
      >
        {label}
        <span className="flex gap-0.5">
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={`inline-block h-2 w-2 rounded-full border ${
                i < left ? on : 'border-ink-subtle/60'
              }`}
            />
          ))}
        </span>
      </button>
    </Tooltip>
  );
}

/**
 * Group or ungroup from the row (11). Grouping takes every row that shares
 * this one's name, numbering aside — "Goblin 1", "Goblin 2" — onto one
 * turn; ungrouping puts this row back on its own.
 */
export function GroupControl({
  entry,
  everyone,
  act,
}: {
  entry: EntryRow;
  everyone: { id: string; label: string; groupId: string | null }[];
  act: Act;
}) {
  const base = entry.label.replace(/\s+\d+$/, '');
  const kin = everyone.filter(
    e => e.label.replace(/\s+\d+$/, '') === base && e.id !== entry.id
  );
  if (entry.groupId) {
    return (
      <Tooltip content="Acts with its group. Tap to act alone.">
        <Button
          size="sm"
          variant="flat"
          className="h-6 min-w-0 px-1.5 text-[0.65rem] text-arcane"
          onPress={() => act(setEntryGroupAction([entry.id], false))}
        >
          Grouped
        </Button>
      </Tooltip>
    );
  }
  if (kin.length === 0) return null;
  return (
    <Tooltip content={`Roll and act as one with the other ${kin.length}.`}>
      <Button
        size="sm"
        variant="light"
        className="h-6 min-w-0 px-1.5 text-[0.65rem] text-ink-subtle"
        onPress={() =>
          act(setEntryGroupAction([entry.id, ...kin.map(k => k.id)], true))
        }
      >
        Group
      </Button>
    </Tooltip>
  );
}
