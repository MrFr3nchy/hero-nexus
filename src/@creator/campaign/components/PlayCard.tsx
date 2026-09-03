'use client';

import { Button, NumberInput, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { Marginalia, Stat } from '@/@shared/components/ui';
import type { PlayState } from '@/server/play';
import { conditionDef } from '../lib/conditions';
import { applyPlayPatchAction } from '../play-actions';

/** Signed modifier — "+3", "−1", "+0". */
function mod(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

function hpColor(current: number, max: number): string {
  if (max <= 0) return 'var(--ink-subtle)';
  const ratio = current / max;
  if (ratio > 0.5) return 'var(--success)';
  if (ratio > 0.25) return 'var(--warning)';
  return 'var(--danger)';
}

/* --- the three-pip tracks ------------------------------------------- */

function Pips({
  count,
  filled,
  tone,
  label,
  disabled,
  onSet,
}: {
  count: number;
  filled: number;
  tone: 'success' | 'danger';
  label: string;
  disabled: boolean;
  onSet: (next: number) => void;
}) {
  const skin = tone === 'success' ? 'bg-success' : 'bg-danger';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: count }, (_, i) => {
          const on = i < filled;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={`${label} ${i + 1}`}
              aria-pressed={on}
              // Clicking the last filled pip clears it, so a mis-tap costs one
              // press rather than a reset.
              onClick={() => onSet(on && i === filled - 1 ? i : i + 1)}
              className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                on ? `${skin} border-transparent` : 'border-line bg-surface-2'
              } ${disabled ? 'cursor-default opacity-60' : 'hover:border-ink-subtle'}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/* --- spell slots ----------------------------------------------------- */

function SlotRow({
  slot,
  disabled,
  onSet,
}: {
  slot: { level: number; total: number; expended: number };
  disabled: boolean;
  onSet: (expended: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-right font-display text-sm tabular-nums text-ink-muted">
        {slot.level}
      </span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: slot.total }, (_, i) => {
          const spent = i < slot.expended;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={`Level ${slot.level} slot ${i + 1}`}
              aria-pressed={spent}
              onClick={() =>
                onSet(spent && i === slot.expended - 1 ? i : i + 1)
              }
              className={`h-4 w-4 rotate-45 border transition-colors ${
                spent
                  ? 'border-line bg-surface-2'
                  : 'border-arcane/60 bg-arcane/25'
              } ${disabled ? 'cursor-default' : 'hover:border-arcane'}`}
            />
          );
        })}
      </div>
      <span className="ml-auto text-xs tabular-nums text-ink-subtle">
        {slot.total - slot.expended} left
      </span>
    </div>
  );
}

/* --- the card -------------------------------------------------------- */

/**
 * A character as it exists during play, not as it is built.
 *
 * Everything here is a number that moves between one roll and the next: hit
 * points, temp HP, hit dice, death saves, spell slots. Anything that only
 * changes when a character levels up belongs in the builder, and deliberately
 * isn't reachable from here — this card has to be safe to hand someone
 * mid-fight.
 */
export function PlayCard({
  state,
  campaignId,
  compact = false,
  onChange,
  onError,
}: {
  state: PlayState;
  campaignId: string | null;
  /** Drop the ability rail and the slots — for the DM's party list. */
  compact?: boolean;
  onChange: (next: PlayState) => void;
  onError: (message: string) => void;
}) {
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = !state.canEdit || busy;

  const patch = async (input: Record<string, unknown>) => {
    setBusy(true);
    const res = await applyPlayPatchAction(
      state.characterId,
      campaignId,
      input
    );
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    onChange(res.data);
  };

  const down = state.hpCurrent <= 0;
  const hpPercent =
    state.hpMax > 0
      ? Math.max(0, Math.min(100, (state.hpCurrent / state.hpMax) * 100))
      : 0;

  return (
    <div
      className={`rounded-[var(--radius-card)] border bg-surface p-4 [box-shadow:var(--shadow-card)] ${
        down ? 'border-danger/50' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg text-ink">
            {state.name}
          </h3>
          <p className="text-xs text-ink-subtle">
            Level {state.level} {state.className || '—'}
            {state.species ? ` · ${state.species}` : ''}
          </p>
        </div>
        <div className="flex items-baseline gap-1 font-display tabular-nums">
          <span
            className="text-2xl"
            style={{ color: hpColor(state.hpCurrent, state.hpMax) }}
          >
            {state.hpCurrent}
          </span>
          <span className="text-sm text-ink-subtle">/ {state.hpMax}</span>
          {state.hpTemp > 0 && (
            <span className="ml-1 text-sm text-info">+{state.hpTemp}</span>
          )}
        </div>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${hpPercent}%`,
            background: hpColor(state.hpCurrent, state.hpMax),
          }}
        />
      </div>

      {state.conditions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {state.conditions.map(key => {
            const def = conditionDef(key);
            if (!def) return null;
            return (
              <Tooltip key={key} content={def.hint}>
                <span
                  className={`rounded-sm border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] ${
                    def.tone === 'danger'
                      ? 'border-danger/40 bg-danger/10 text-danger'
                      : 'border-warning/40 bg-warning/10 text-warning'
                  }`}
                >
                  {def.label}
                </span>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* damage / heal */}
      {state.canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="flat"
            className="min-w-0 px-3 text-danger"
            isDisabled={locked || !amount}
            onPress={() => {
              patch({ hpCurrentDelta: -Math.abs(amount) });
              setAmount(0);
            }}
          >
            Take
          </Button>
          <NumberInput
            aria-label="Hit points"
            size="sm"
            hideStepper
            minValue={0}
            className="w-20"
            value={amount}
            onValueChange={v => setAmount(Number(v) || 0)}
          />
          <Button
            size="sm"
            variant="flat"
            className="min-w-0 px-3 text-success"
            isDisabled={locked || !amount}
            onPress={() => {
              patch({ hpCurrentDelta: Math.abs(amount) });
              setAmount(0);
            }}
          >
            Heal
          </Button>
          <Button
            size="sm"
            variant="light"
            className="min-w-0 px-2 text-ink-muted"
            isDisabled={locked || !amount}
            onPress={() => {
              patch({ hpTemp: amount });
              setAmount(0);
            }}
          >
            as temp
          </Button>
        </div>
      )}

      {/* hit dice + death saves */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
            Hit dice
          </span>
          <span className="font-display text-sm tabular-nums text-ink">
            {state.hitDiceMax - state.hitDiceSpent}
            <span className="text-ink-subtle">
              /{state.hitDiceMax} d{state.hitDieSize}
            </span>
          </span>
          {state.canEdit && state.hitDiceMax > 0 && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="light"
                aria-label="Spend a hit die"
                className="min-w-0 px-2 text-ink-muted"
                isDisabled={locked || state.hitDiceSpent >= state.hitDiceMax}
                onPress={() => patch({ hitDiceSpent: state.hitDiceSpent + 1 })}
              >
                spend
              </Button>
              <Button
                size="sm"
                variant="light"
                aria-label="Take a hit die back"
                className="min-w-0 px-2 text-ink-subtle"
                isDisabled={locked || state.hitDiceSpent === 0}
                onPress={() => patch({ hitDiceSpent: state.hitDiceSpent - 1 })}
              >
                undo
              </Button>
            </div>
          )}
        </div>

        {down && (
          <>
            <Pips
              count={3}
              filled={state.deathSaveSuccesses}
              tone="success"
              label="Saves"
              disabled={locked}
              onSet={n => patch({ deathSaveSuccesses: n })}
            />
            <Pips
              count={3}
              filled={state.deathSaveFailures}
              tone="danger"
              label="Fails"
              disabled={locked}
              onSet={n => patch({ deathSaveFailures: n })}
            />
          </>
        )}
      </div>

      {down && (
        <Marginalia className="mt-2" dash>
          {state.deathSaveFailures >= 3
            ? 'gone'
            : state.deathSaveSuccesses >= 3
              ? 'stable, but not up'
              : 'bleeding out'}
        </Marginalia>
      )}

      {!compact && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 sm:grid-cols-6">
            <Stat plain label="AC" value={state.armorClass} />
            <Stat plain label="Init" value={mod(state.initiative)} />
            <Stat plain label="Speed" value={state.speed} />
            <Stat plain label="Prof" value={mod(state.proficiency)} />
            <Stat plain label="Pass. per" value={state.passivePerception} />
            <Stat
              plain
              label="Save DC"
              value={state.spellSaveDc ?? '—'}
              hint={
                state.spellAttack != null
                  ? `atk ${mod(state.spellAttack)}`
                  : undefined
              }
            />
          </div>

          {state.slots.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                Spell slots
              </p>
              {state.slots.map(slot => (
                <SlotRow
                  key={slot.level}
                  slot={slot}
                  disabled={locked}
                  onSet={expended =>
                    patch({ slot: { level: slot.level, expended } })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {state.canEdit && (
        <div className="mt-3 border-t border-line pt-3">
          <Button
            size="sm"
            variant="flat"
            isDisabled={busy}
            onPress={() => patch({ longRest: true })}
          >
            Long rest
          </Button>
          <span className="ml-2 text-xs text-ink-subtle">
            Full HP, slots back, half your hit dice returned.
          </span>
        </div>
      )}
    </div>
  );
}
