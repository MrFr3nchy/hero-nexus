'use client';

import { Button, Input, Select, SelectItem, Switch } from '@heroui/react';
import { useState } from 'react';

import { motion } from '@/@shared/components/motion';
import { Marginalia, SectionCard } from '@/@shared/components/ui';
import { withAdvantage } from '@/@shared/lib/dice';
import type { CharacterRow } from '@/server/characters';
import type { LiveState, RollRow } from '@/server/session';
import { clearRollsAction, rollAction } from '../../actions';

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
  const counted = roll.dice.filter((_, i) => !roll.dropped.includes(i));
  if (counted.length !== 1) return null;
  if (!/d20/i.test(roll.notation)) return null;
  if (counted[0] === 20) return 'crit';
  if (counted[0] === 1) return 'fumble';
  return null;
}

function RollLine({ roll }: { roll: RollRow }) {
  const tone = critTone(roll);
  const totalClass =
    tone === 'crit'
      ? 'text-success'
      : tone === 'fumble'
        ? 'text-danger'
        : 'text-ink';

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
    await refresh();
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
                <RollLine key={r.id} roll={r} />
              ))}
            </ol>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
