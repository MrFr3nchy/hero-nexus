'use client';

import {
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import { useState } from 'react';

import { motion } from '@/@shared/components/motion';
import {
  BattlefieldScene,
  EmptyState,
  Marginalia,
  SectionCard,
} from '@/@shared/components/ui';
import type { EntryRow, EntrySide, LiveState } from '@/server/session';
import {
  addEntryAction,
  addPartyAction,
  advanceTurnAction,
  applyHpAction,
  endEncounterAction,
  removeEntryAction,
  rollInitiativeAction,
  updateEntryAction,
} from '../../actions';
import { ConditionChips, ConditionPicker } from './ConditionPicker';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/** What a player is told about a foe's health, since they get no numbers. */
function hpWord(cur: number | null, max: number | null): string {
  if (cur == null || max == null || max <= 0) return '—';
  if (cur <= 0) return 'Down';
  const pct = cur / max;
  if (pct <= 0.25) return 'Barely standing';
  if (pct <= 0.5) return 'Bloodied';
  return 'Healthy';
}

function hpColor(cur: number, max: number): string {
  if (max <= 0) return 'var(--ink-subtle)';
  const ratio = cur / max;
  if (ratio > 0.5) return 'var(--success)';
  if (ratio > 0.25) return 'var(--warning)';
  return 'var(--danger)';
}

const SIDE_LABEL: Record<EntrySide, string> = {
  party: 'Party',
  foe: 'Foe',
  other: 'Bystander',
};

/* --- the HP control (staff) ------------------------------------------ */

/**
 * Damage and healing, not "type the new number".
 *
 * A DM says "seven damage", so the box takes seven and the arithmetic —
 * temp HP first, never below zero, healing capped at max — happens on the
 * server where the rules live.
 */
function HpControl({ entry, act }: { entry: EntryRow; act: Act }) {
  const [amount, setAmount] = useState<number>(0);

  if (entry.hpCurrent == null || entry.hpMax == null) {
    return <span className="text-xs text-ink-subtle">no hp</span>;
  }

  const apply = (sign: 1 | -1) => {
    if (!amount) return;
    act(applyHpAction(entry.id, sign * Math.abs(amount)));
    setAmount(0);
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="flat"
        aria-label={`Damage ${entry.label}`}
        className="min-w-0 px-2 text-danger"
        onPress={() => apply(-1)}
      >
        −
      </Button>
      <NumberInput
        aria-label={`Amount for ${entry.label}`}
        size="sm"
        hideStepper
        minValue={0}
        className="w-16"
        value={amount}
        onValueChange={v => setAmount(Number(v) || 0)}
      />
      <Button
        size="sm"
        variant="flat"
        aria-label={`Heal ${entry.label}`}
        className="min-w-0 px-2 text-success"
        onPress={() => apply(1)}
      >
        +
      </Button>
    </div>
  );
}

/* --- one combatant ---------------------------------------------------- */

function EntryLine({
  entry,
  current,
  isStaff,
  isYours,
  act,
}: {
  entry: EntryRow;
  current: boolean;
  isStaff: boolean;
  isYours: boolean;
  act: Act;
}) {
  const showNumbers = isStaff || entry.side === 'party';
  const hp = entry.hpCurrent;
  const max = entry.hpMax;

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-2 py-2.5 ${
        current ? 'bg-surface-2 ring-1 ring-gold/40' : ''
      }`}
    >
      <span className="w-8 shrink-0 text-center font-display text-lg tabular-nums text-ink">
        {entry.initiative}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {current && (
            <span aria-hidden="true" className="text-gold">
              ▶
            </span>
          )}
          <span
            className={`text-sm ${
              entry.side === 'party' ? 'text-ink' : 'text-ink-muted'
            } ${hp === 0 ? 'line-through opacity-70' : ''}`}
          >
            {entry.label}
          </span>
          {isYours && (
            <span className="rounded-sm border border-gold/50 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-gold-strong dark:text-gold">
              You
            </span>
          )}
          {entry.concentrating && (
            <Tooltip content="Concentrating — damage forces a save.">
              <span className="rounded-sm border border-arcane/40 bg-arcane/10 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-arcane">
                Conc.
              </span>
            </Tooltip>
          )}
          <ConditionChips stored={entry.conditionKeys} />
          {entry.conditions && (
            <span className="text-xs text-ink-subtle">{entry.conditions}</span>
          )}
        </div>

        {showNumbers && hp != null && max != null && max > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%`,
                  background: hpColor(hp, max),
                }}
              />
            </div>
            <span className="text-xs tabular-nums text-ink-muted">
              {hp} / {max} hp
              {entry.hpTemp > 0 && (
                <span className="text-info"> +{entry.hpTemp} temp</span>
              )}
              {entry.armorClass != null && (
                <span className="text-ink-subtle">
                  {' '}
                  · ac {entry.armorClass}
                </span>
              )}
            </span>
          </div>
        )}
        {!showNumbers && (
          <p className="mt-1 text-xs text-ink-subtle">
            {hpWord(entry.hpCurrent, entry.hpMax)}
          </p>
        )}
      </div>

      {isStaff && (
        <div className="flex flex-wrap items-center gap-1">
          <HpControl entry={entry} act={act} />
          <ConditionPicker
            stored={entry.conditionKeys}
            onChange={keys =>
              act(
                updateEntryAction(entry.id, { conditionKeys: keys.join(',') })
              )
            }
          />
          <Button
            size="sm"
            variant={entry.concentrating ? 'flat' : 'light'}
            aria-label={`Toggle concentration for ${entry.label}`}
            className={`min-w-0 px-2 ${
              entry.concentrating ? 'text-arcane' : 'text-ink-subtle'
            }`}
            onPress={() =>
              act(
                updateEntryAction(entry.id, {
                  concentrating: !entry.concentrating,
                })
              )
            }
          >
            ◈
          </Button>
          <Button
            size="sm"
            variant="light"
            aria-label={`Remove ${entry.label}`}
            className="min-w-0 px-2 text-ink-subtle data-[hover=true]:text-danger"
            onPress={() => act(removeEntryAction(entry.id))}
          >
            ✕
          </Button>
        </div>
      )}
    </li>
  );
}

/* --- the tracker ------------------------------------------------------ */

export function InitiativeTracker({
  state,
  isStaff,
  refresh,
  onError,
}: {
  state: LiveState;
  isStaff: boolean;
  refresh: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const enc = state.encounter;
  const [label, setLabel] = useState('');
  const [initiative, setInitiative] = useState(0);
  const [hp, setHp] = useState(0);
  const [ac, setAc] = useState(0);
  const [side, setSide] = useState<EntrySide>('foe');

  const act: Act = async p => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  if (!enc) {
    if (isStaff) return null; // the panel offers the "start" card instead
    return (
      <SectionCard title="Initiative">
        <EmptyState
          scene={<BattlefieldScene />}
          title="Nothing is trying to kill you"
          description="The DM hasn't called for initiative yet."
        />
      </SectionCard>
    );
  }

  const add = () => {
    if (!label.trim()) return;
    act(
      addEntryAction(enc.id, {
        label,
        initiative,
        side,
        hpMax: hp || null,
        hpCurrent: hp || null,
        armorClass: ac || null,
      })
    );
    setLabel('');
    setInitiative(0);
    setHp(0);
    setAc(0);
  };

  const standing = state.entries.filter(
    e => e.side === 'party' && (e.hpCurrent == null || e.hpCurrent > 0)
  ).length;
  const party = state.entries.filter(e => e.side === 'party').length;

  return (
    <SectionCard
      title={enc.name}
      description={`Round ${enc.round}`}
      actions={
        isStaff && (
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="flat"
              onPress={() => act(advanceTurnAction(enc.id, -1))}
            >
              Back
            </Button>
            <motion.div whileTap={{ rotate: [0, -6, 6, -3, 0] }}>
              <Button
                size="sm"
                color="primary"
                onPress={() => act(advanceTurnAction(enc.id, 1))}
              >
                Next turn
              </Button>
            </motion.div>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={() => act(endEncounterAction(enc.id))}
            >
              End
            </Button>
          </div>
        )
      }
    >
      <ol className="divide-y divide-line">
        {state.entries.map((e, i) => (
          <EntryLine
            key={e.id}
            entry={e}
            current={i === enc.turnIndex}
            isStaff={isStaff}
            isYours={
              e.characterId != null && e.characterId === state.viewerCharacterId
            }
            act={act}
          />
        ))}
        {state.entries.length === 0 && (
          <li className="py-3 text-sm text-ink-subtle">
            Nobody has rolled in yet.
          </li>
        )}
      </ol>

      {party > 0 && (
        <Marginalia className="mt-3">
          {standing === party
            ? 'everyone still upright'
            : standing === 0
              ? 'the whole party is down'
              : `${standing} of ${party} still upright`}
        </Marginalia>
      )}

      {isStaff && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="flat"
              onPress={() => act(addPartyAction(enc.id))}
            >
              Add the party
            </Button>
            <Button
              size="sm"
              variant="flat"
              onPress={() => act(rollInitiativeAction(enc.id))}
            >
              Roll for anyone at 0
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Input
              size="sm"
              label="Add a combatant"
              placeholder="Goblin"
              value={label}
              onValueChange={setLabel}
              className="min-w-40 flex-1"
            />
            <Select
              aria-label="Side"
              size="sm"
              className="w-32"
              selectedKeys={[side]}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                if (key) setSide(String(key) as EntrySide);
              }}
            >
              {(['foe', 'party', 'other'] as EntrySide[]).map(s => (
                <SelectItem key={s} textValue={SIDE_LABEL[s]}>
                  {SIDE_LABEL[s]}
                </SelectItem>
              ))}
            </Select>
            <NumberInput
              size="sm"
              label="Init"
              className="w-20"
              value={initiative}
              onValueChange={v => setInitiative(Number(v) || 0)}
            />
            <NumberInput
              size="sm"
              label="HP"
              minValue={0}
              className="w-24"
              value={hp}
              onValueChange={v => setHp(Number(v) || 0)}
            />
            <NumberInput
              size="sm"
              label="AC"
              minValue={0}
              className="w-20"
              value={ac}
              onValueChange={v => setAc(Number(v) || 0)}
            />
            <Button
              size="sm"
              color="primary"
              isDisabled={!label.trim()}
              onPress={add}
            >
              Add
            </Button>
          </div>
          <p className="text-xs text-ink-subtle">
            A second &ldquo;Goblin&rdquo; numbers itself, and the first becomes
            Goblin 1. Leave initiative at 0 to roll for it later.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
