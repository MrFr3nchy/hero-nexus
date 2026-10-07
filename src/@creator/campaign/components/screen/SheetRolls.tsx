'use client';

import { Switch } from '@heroui/react';
import { useState } from 'react';

import { FaceEntry, useDiceTray } from '@/@shared/components/dice';
import {
  ABILITY_KEYS,
  SKILL_KEYS,
  SKILL_LABELS,
} from '@/@creator/character/schema';
import type { PlayState } from '@/server/play';
import { rollFromSheetAction } from '../../actions';
import { rollAdvice, type RollMode } from '../../lib/condition-effects';
import {
  ABILITY_LABELS,
  ABILITY_SHORT,
  sheetRollLabel,
  sheetRollTest,
  signed,
  type SheetRoll,
} from '../../lib/sheet-rolls';

/** `rollAdvice`'s word for a plain d20 is `flat`; the switch says straight. */
type Mode = RollMode;

const MODE_WORD: Record<Mode, string> = {
  disadvantage: 'disadvantage',
  flat: 'straight',
  advantage: 'advantage',
};

/** The gold dot a printed sheet puts beside a proficiency. */
function Proficient() {
  return (
    <span
      aria-hidden="true"
      className="ml-1 inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-gold align-middle"
    />
  );
}

/**
 * Roll from your sheet: every d20 test a hero makes unasked — an ability,
 * a save, a skill, initiative — one press each.
 *
 * Before this, rolling Stealth meant working out +7, typing `1d20+7` into
 * Dice and typing "Stealth" beside it, and the DM had to take the +7 on
 * trust. Now the button sends *which* roll; the server reads the bonus off
 * the sheet and rolls, and the tray draws the faces it rolled (rule 4).
 *
 * Advantage defaults from the hero's conditions per press — a Poisoned
 * rogue's Stealth goes out at disadvantage, their Dexterity save does not —
 * and a press on the switch overrides the next roll only, because the
 * reasons for advantage at a table are mostly one-off.
 */
export function SheetRolls({
  campaignId,
  play,
  refresh,
  onError,
}: {
  campaignId: string;
  play: PlayState;
  refresh?: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const tray = useDiceTray();
  const [override, setOverride] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [realDice, setRealDice] = useState(false);
  const [pending, setPending] = useState<SheetRoll | null>(null);
  const b = play.bonuses;
  const locked = !play.canEdit || busy;

  const adviceFor = (roll: SheetRoll) => {
    const { what, ability } = sheetRollTest(roll);
    return rollAdvice(play.conditions, what, ability, {
      heavilyLaden: play.weight?.disadvantage,
    });
  };
  // What the switch shows when nobody has touched it: the rules' word on a
  // check, since most presses here are skills.
  const checkAdvice = rollAdvice(play.conditions, 'check', null, {
    heavilyLaden: play.weight?.disadvantage,
  });
  const shown: Mode = override ?? checkAdvice.mode;
  const because = [
    ...checkAdvice.because,
    play.d20Penalty !== 0
      ? `Exhaustion · ${play.d20Penalty} on d20 tests`
      : null,
  ].filter(Boolean);

  const roll = async (what: SheetRoll, faces?: number[]) => {
    const mode = override ?? adviceFor(what).mode;
    if (realDice && !faces) {
      setPending(what);
      return;
    }
    setBusy(true);
    const res = await rollFromSheetAction(
      campaignId,
      play.characterId,
      what,
      mode === 'flat' ? 'straight' : mode,
      faces
    );
    setBusy(false);
    setPending(null);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    setOverride(null);
    const shownRoll = tray.showNotationRoll(res.data, {
      title: sheetRollLabel(what),
      hint: res.data.notation,
      physical: faces !== undefined,
    });
    await refresh?.();
    await shownRoll;
  };

  const pendingMode: Mode = pending
    ? (override ?? adviceFor(pending).mode)
    : 'flat';

  return (
    <div className="@container space-y-2 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="flex-1 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
          Roll from your sheet
        </p>
        {because.length > 0 && (
          <span className="text-xs text-warning">{because.join(' · ')}</span>
        )}
        <div
          role="group"
          aria-label="How the next roll goes"
          className="inline-flex rounded-md border border-line bg-surface-2 p-0.5"
        >
          {(['disadvantage', 'flat', 'advantage'] as const).map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={shown === m}
              onClick={() => setOverride(m === checkAdvice.mode ? null : m)}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                shown === m
                  ? 'bg-gold font-medium text-bg'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {MODE_WORD[m]}
            </button>
          ))}
        </div>
        {play.physicalDice && (
          <Switch size="sm" isSelected={realDice} onValueChange={setRealDice}>
            <span className="text-xs text-ink-muted">Real dice</span>
          </Switch>
        )}
      </div>

      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-gold/40 px-2 py-1.5">
          <span className="text-xs text-ink-muted">
            {sheetRollLabel(pending)} — the faces you rolled
          </span>
          <FaceEntry
            inline
            sides={pendingMode === 'flat' ? [20] : [20, 20]}
            label={sheetRollLabel(pending)}
            disabled={busy}
            onSubmit={faces => roll(pending, faces)}
            onCancel={() => setPending(null)}
          />
        </div>
      )}

      {/* Six abilities: the score's modifier is the button, the score under
          it — the way a printed sheet sets them. */}
      <div className="grid grid-cols-3 gap-1.5 @md:grid-cols-6">
        {ABILITY_KEYS.map(key => {
          const a = b.abilities[key];
          return (
            <button
              key={key}
              type="button"
              disabled={locked}
              onClick={() => roll({ kind: 'ability', key })}
              aria-label={`${ABILITY_LABELS[key]} ${signed(a.mod)}`}
              className="flex flex-col items-center rounded-md border border-line bg-surface-2 px-1 py-1.5 transition-colors hover:border-gold disabled:opacity-50"
            >
              <span className="font-display-alt text-[0.58rem] tracking-[0.14em] text-ink-subtle">
                {ABILITY_SHORT[key]}
              </span>
              <span className="font-display text-lg leading-tight text-ink tabular-nums">
                {signed(a.mod)}
              </span>
              <span className="text-[0.7rem] text-ink-muted tabular-nums">
                {a.score}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[0.7rem] text-ink-subtle">Saving throws</p>
      <div className="grid grid-cols-3 gap-1.5 @md:grid-cols-6">
        {ABILITY_KEYS.map(key => {
          const a = b.abilities[key];
          return (
            <button
              key={key}
              type="button"
              disabled={locked}
              onClick={() => roll({ kind: 'save', key })}
              aria-label={`${ABILITY_LABELS[key]} save ${signed(a.save)}${
                a.proficientSave ? ', proficient' : ''
              }`}
              className="flex items-center justify-between gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs transition-colors hover:border-gold disabled:opacity-50"
            >
              <span className="flex items-center text-ink-muted">
                {ABILITY_SHORT[key]}
                {a.proficientSave && <Proficient />}
              </span>
              <span className="font-semibold text-ink tabular-nums">
                {signed(a.save)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[0.7rem] text-ink-subtle">Skills</p>
      <div className="grid grid-cols-2 gap-1 @md:grid-cols-3">
        {SKILL_KEYS.map(key => {
          const s = b.skills[key];
          return (
            <button
              key={key}
              type="button"
              disabled={locked}
              onClick={() => roll({ kind: 'skill', key })}
              aria-label={`${SKILL_LABELS[key]} ${signed(s.bonus)}${
                s.proficient ? ', proficient' : ''
              }`}
              className="flex items-center justify-between gap-1 rounded-md border border-line bg-surface px-2 py-1 text-left text-xs transition-colors hover:border-gold disabled:opacity-50"
            >
              <span className="flex min-w-0 items-center truncate text-ink">
                {SKILL_LABELS[key]}
                {s.proficient && <Proficient />}
              </span>
              <span className="font-semibold text-ink tabular-nums">
                {signed(s.bonus)}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={locked}
        onClick={() => roll({ kind: 'initiative' })}
        className="rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink transition-colors hover:border-gold disabled:opacity-50"
      >
        Initiative{' '}
        <span className="font-semibold tabular-nums">
          {signed(b.initiative)}
        </span>
      </button>
    </div>
  );
}
