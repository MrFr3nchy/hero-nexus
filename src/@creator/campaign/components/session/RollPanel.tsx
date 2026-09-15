'use client';

import { Button, Input, Select, SelectItem, Switch } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';

import { useDiceTray } from '@/@shared/components/dice';
import { motion } from '@/@shared/components/motion';
import { Marginalia, SectionCard } from '@/@shared/components/ui';
import { critToneOf, withAdvantage } from '@/@shared/lib/dice';
import { rollAdvice } from '@/@creator/campaign/lib/condition-effects';
import type { CharacterRow } from '@/server/characters';
import type { LiveState, RollRow } from '@/server/session';
import { clearRollsAction, rollAction } from '../../actions';
import { applyDamageAction } from '../../fight-actions';
import { outcomeWords } from '@/@creator/campaign/lib/attack';

/** The dice a table reaches for without typing anything. */
const QUICK = ['d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100'];

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** A natural 20 or a natural 1 on a lone d20 is the only thing worth a colour. */
function critTone(roll: RollRow): 'crit' | 'fumble' | null {
  return critToneOf(roll.notation, roll.dice, roll.dropped);
}

/**
 * One roll in the log. An attack's to-hit row (06) also reads its verdict —
 * "hit (17) · 9 slashing → 4 after resistance" — and carries **Apply** while
 * the damage is still proposed: for staff always, for a player when the
 * table lets them land their own hits on a foe or the hit is on their own
 * hero. The server decides again; the button is the offer.
 */
function RollLine({
  roll,
  canApply,
  onApply,
}: {
  roll: RollRow;
  canApply: boolean;
  onApply: (rollId: string) => Promise<void>;
}) {
  const tone = critTone(roll);
  const totalClass =
    tone === 'crit'
      ? 'text-success'
      : tone === 'fumble'
        ? 'text-danger'
        : 'text-ink';
  const o = roll.outcome;

  return (
    <li className="flex items-baseline gap-3 py-2">
      <span
        className={`w-12 shrink-0 text-right font-display text-xl tabular-nums ${totalClass}`}
      >
        {roll.total}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">
          {roll.actorName}
          {roll.label && (
            <span className="text-ink-muted"> · {roll.label}</span>
          )}
          {roll.visibility === 'dm' && (
            <span className="ml-1.5 rounded-sm border border-line px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle">
              behind the screen
            </span>
          )}
        </p>
        <p className="text-xs text-ink-subtle">
          <span className="font-mono">{roll.notation}</span>
          {' · '}
          {roll.dice.map((die, i) => (
            <span
              key={i}
              className={
                roll.dropped.includes(i)
                  ? 'text-ink-subtle line-through opacity-60'
                  : 'text-ink-muted'
              }
            >
              {die}
              {i < roll.dice.length - 1 ? ', ' : ''}
            </span>
          ))}
          {roll.modifier !== 0 &&
            ` ${roll.modifier > 0 ? '+' : '−'} ${Math.abs(roll.modifier)}`}
          {tone === 'crit' && ' · natural 20'}
          {tone === 'fumble' && ' · natural 1'}
        </p>
        {o && (o.hit !== null || o.damage) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
            <span
              className={
                o.hit === true
                  ? 'text-success'
                  : o.hit === false
                    ? 'text-danger'
                    : 'text-ink-muted'
              }
            >
              {outcomeWords(o, roll.total)}
            </span>
            {o.ac !== null && (
              <span className="text-ink-subtle">vs AC {o.ac}</span>
            )}
            {o.because.length > 0 && (
              <span className="text-ink-subtle">{o.because.join(' · ')}</span>
            )}
            {o.damage &&
              o.targetEntryId &&
              o.hit !== false &&
              (o.applied ? (
                <span className="text-ink-subtle">
                  applied by {o.applied.byName}
                </span>
              ) : canApply ? (
                <Button
                  size="sm"
                  variant="flat"
                  className="h-5 min-w-0 px-1.5 text-[0.65rem]"
                  onPress={() => onApply(roll.id)}
                >
                  Apply {o.damage.amount} to {o.targetLabel}
                </Button>
              ) : (
                <span className="text-ink-subtle">proposed</span>
              ))}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[0.65rem] tabular-nums text-ink-subtle">
        {timeOf(roll.createdAt)}
      </span>
    </li>
  );
}

/**
 * The table's shared dice.
 *
 * Rolls go to the server, which rolls them and writes the faces down, so the
 * log is a record rather than a claim — the reason to roll in the app at all
 * instead of on the desk. The DM alone can roll behind the screen.
 */
export function RollPanel({
  campaignId,
  state,
  isStaff,
  myCharacters,
  refresh,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  myCharacters: CharacterRow[];
  refresh: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [notation, setNotation] = useState('');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'flat' | 'advantage' | 'disadvantage'>(
    'flat'
  );
  const [hidden, setHidden] = useState(false);
  const [characterId, setCharacterId] = useState<string>(
    state.viewerCharacterId ?? ''
  );
  const [spin, setSpin] = useState(0);
  const tray = useDiceTray();

  /*
   * What the rules say about a d20 in this hand. A default, never a lock:
   * the picker below is still the picker, and the DM's ruling on whether the
   * source of the fear is in sight is theirs to make. Read off the live party
   * state so a condition put on mid-fight moves the default without a remount.
   */
  const mine = useMemo(
    () => state.party.find(p => p.characterId === characterId) ?? null,
    [state.party, characterId]
  );
  const advice = useMemo(
    () => rollAdvice(mine?.conditions ?? [], 'check'),
    [mine?.conditions]
  );
  const adviceKey = `${advice.mode}:${advice.because.join('|')}`;
  useEffect(() => {
    setMode(advice.mode);
    // Re-defaults only when the advice itself changes, so a player who flipped
    // it back is not fought every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adviceKey]);

  /**
   * The server rolls, then the tray draws the faces it rolled. The dice on
   * screen are a picture of the log entry, not a second roll — which is why
   * the animation waits for the round trip instead of racing it.
   */
  const roll = async (expression: string) => {
    const finished =
      mode === 'flat' ? expression : withAdvantage(expression, mode);
    setSpin(s => s + 1);
    const res = await rollAction(campaignId, {
      notation: finished,
      label,
      characterId: characterId || null,
      visibility: hidden ? 'dm' : 'table',
    });
    if (!res.ok) {
      onError(res.error ?? 'The dice did not land.');
      return;
    }
    const named = label.trim();
    const shown = tray.showNotationRoll(res.data, {
      title: named || res.data.notation,
      hint: named ? res.data.notation : undefined,
    });
    await refresh();
    await shown;
  };

  return (
    <SectionCard
      title="The dice"
      description="Rolled on the server, so the log is what happened."
      actions={
        isStaff &&
        state.rolls.length > 0 && (
          <Button
            size="sm"
            variant="light"
            className="text-ink-muted"
            onPress={async () => {
              const res = await clearRollsAction(campaignId);
              if (!res.ok) onError(res.error ?? 'Failed to clear the log.');
              await refresh();
            }}
          >
            Clear log
          </Button>
        )
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map(die => (
            <motion.div key={die} whileTap={{ scale: 0.92 }}>
              <Button
                size="sm"
                variant="flat"
                className="min-w-0 px-3 font-mono"
                onPress={() => roll(die)}
              >
                {die}
              </Button>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Input
            size="sm"
            label="Or type it"
            placeholder="2d6+3"
            value={notation}
            onValueChange={setNotation}
            className="min-w-32 flex-1 font-mono"
            onKeyDown={e => {
              if (e.key === 'Enter' && notation.trim()) roll(notation);
            }}
          />
          <Input
            size="sm"
            label="For"
            placeholder="Stealth"
            value={label}
            onValueChange={setLabel}
            className="min-w-28 flex-1"
          />
          <Button
            size="sm"
            color="primary"
            isDisabled={!notation.trim()}
            onPress={() => roll(notation)}
          >
            Roll
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
            {(['disadvantage', 'flat', 'advantage'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${
                  mode === m
                    ? 'bg-gold font-medium text-bg'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {m === 'flat' ? 'straight' : m}
              </button>
            ))}
          </div>
          {(advice.because.length > 0 || (mine?.d20Penalty ?? 0) !== 0) && (
            <span className="text-xs text-warning">
              {[
                ...advice.because,
                mine && mine.d20Penalty !== 0
                  ? `Exhaustion · ${mine.d20Penalty} on d20 tests`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}

          {myCharacters.length > 0 && (
            <Select
              aria-label="Roll as"
              size="sm"
              className="w-44"
              placeholder="Roll as yourself"
              selectedKeys={characterId ? [characterId] : []}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                setCharacterId(key ? String(key) : '');
              }}
            >
              {myCharacters.map(c => (
                <SelectItem key={c.id} textValue={c.name || 'Unnamed'}>
                  {c.name || 'Unnamed'}
                </SelectItem>
              ))}
            </Select>
          )}

          {isStaff && (
            <Switch size="sm" isSelected={hidden} onValueChange={setHidden}>
              <span className="text-xs text-ink-muted">Behind the screen</span>
            </Switch>
          )}
        </div>

        <div className="border-t border-line pt-2">
          {state.rolls.length === 0 ? (
            <Marginalia dash>no one has touched the dice yet</Marginalia>
          ) : (
            <ol key={spin} className="divide-y divide-line">
              {state.rolls.map(r => (
                <RollLine
                  key={r.id}
                  roll={r}
                  canApply={
                    isStaff ||
                    (state.rules.playersApplyDamage !== 'never' &&
                      r.characterId !== null &&
                      r.characterId === state.viewerCharacterId) ||
                    (r.outcome?.targetEntryId != null &&
                      state.entries.find(e => e.id === r.outcome?.targetEntryId)
                        ?.characterId === state.viewerCharacterId)
                  }
                  onApply={async id => {
                    const res = await applyDamageAction(id);
                    if (!res.ok) onError(res.error);
                    await refresh();
                  }}
                />
              ))}
            </ol>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
