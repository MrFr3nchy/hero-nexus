'use client';

import { Button, Tooltip } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSelectedToken } from '@/@shared/battlemap/selection';
import { useDiceTray } from '@/@shared/components/dice';
import { Glyph, Marginalia } from '@/@shared/components/ui';
import { withAdvantage } from '@/@shared/lib/dice';
import { distanceFeet } from '@/@creator/campaign/lib/battlemap';
import {
  attackedWith,
  rollAdvice,
} from '@/@creator/campaign/lib/condition-effects';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import { fmtBonus, type WeaponAttack } from '@/@creator/character/lib/derive';
import type { LiveState } from '@/server/session';
import { rollAction } from '../../actions';
import { getMyAttacksAction, mySeatAction } from '../../fight-actions';

type Mode = 'flat' | 'advantage' | 'disadvantage';

/**
 * What the target's own state does to the swing — "Prone · advantage in
 * melee, disadvantage at range". Words only: the mode picker is the
 * attacker's, and whether this blow is melee is theirs to know.
 */
function TargetAdvice({
  conditions,
  name,
}: {
  conditions: ReturnType<typeof parseConditions>;
  name: string;
}) {
  const melee = attackedWith(conditions, true);
  const ranged = attackedWith(conditions, false);
  if (melee === 'flat' && ranged === 'flat') return null;
  const word = (m: typeof melee) =>
    m === 'advantage'
      ? 'advantage'
      : m === 'disadvantage'
        ? 'disadvantage'
        : 'straight';
  return (
    <p className="text-[0.7rem] text-ink-muted">
      Against {name}:{' '}
      {melee === ranged
        ? word(melee)
        : `${word(melee)} in melee, ${word(ranged)} at range`}
    </p>
  );
}

/**
 * The viewer's weapons in hand, ready to roll.
 *
 * One row per equipped weapon off `weaponAttacks` — the same pure function
 * the play page uses, on a live path. *Hit* rolls `1d20+bonus` with the
 * mode; *damage* rolls the dice string, two-handed when the weapon is
 * versatile and the viewer says so. Both go through `rollAction` as the
 * character, so both land in the shared log and the tray draws the server's
 * faces, and the label names the weapon and — when a token is selected on the
 * board — the target and the range.
 *
 * It refuses nothing. A long shot, a target out of reach: the row says so in
 * words and rolls anyway, because a DM can rule it and the app cannot.
 */
export function AttacksPanel({
  campaignId,
  state,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  onError: (message: string) => void;
}) {
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [attacks, setAttacks] = useState<WeaponAttack[] | null>(null);
  const [mode, setMode] = useState<Mode>('flat');
  const [twoHanded, setTwoHanded] = useState<Set<string>>(new Set());
  const tray = useDiceTray();
  const selectedId = useSelectedToken(campaignId);

  useEffect(() => {
    mySeatAction(campaignId).then(setCharacterId);
  }, [campaignId]);

  const load = useCallback(async () => {
    if (!characterId) return;
    setAttacks(await getMyAttacksAction(characterId, campaignId));
  }, [characterId, campaignId]);

  // Re-read when the loadout changes: `party` carries the viewer's own play
  // state, and its `loadoutKey` moves when anything is drawn, stowed, given
  // or received. Armour class alone missed a longbow being drawn.
  const mine = useMemo(
    () => state.party.find(p => p.characterId === characterId) ?? null,
    [state.party, characterId]
  );
  useEffect(() => {
    load();
  }, [load, mine?.loadoutKey]);

  /*
   * The rules' default for the mode, from what the attacker is under. A
   * default and not a lock — the picker stays — and re-applied only when the
   * advice moves, so a player who flipped it back is not fought every poll.
   */
  const advice = useMemo(
    () => rollAdvice(mine?.conditions ?? [], 'attack'),
    [mine?.conditions]
  );
  const adviceKey = `${advice.mode}:${advice.because.join('|')}`;
  useEffect(() => {
    setMode(advice.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adviceKey]);
  const penalty = mine?.d20Penalty ?? 0;

  /* --- the target ------------------------------------------------------ */

  const board = state.battlemap;
  const myToken = useMemo(() => {
    if (!board || !characterId) return null;
    const entry = state.entries.find(e => e.characterId === characterId);
    return entry
      ? (board.tokens.find(t => t.entryId === entry.id) ?? null)
      : null;
  }, [board, state.entries, characterId]);

  const target = useMemo(() => {
    if (!board || !selectedId) return null;
    const token = board.tokens.find(t => t.id === selectedId);
    if (!token || token.id === myToken?.id) return null;
    const entry = token.entryId
      ? state.entries.find(e => e.id === token.entryId)
      : undefined;
    return {
      token,
      // `||`, not `??`: a token's label is the empty string, not null, when
      // it has none — and a foe the DM has not named is "Something" here for
      // the same reason it is on the board's own status line.
      name: entry?.label || token.label || 'Something',
      feet: myToken ? distanceFeet(myToken, token) : null,
      conditions: parseConditions(entry?.conditionKeys ?? ''),
    };
  }, [board, selectedId, myToken, state.entries]);

  /* --- rolling ---------------------------------------------------------- */

  const roll = async (attack: WeaponAttack, what: 'hit' | 'damage') => {
    if (!characterId) return;
    const two = twoHanded.has(attack.itemId) && attack.versatileDamage;
    // Exhaustion comes off every d20 test (2024), so it comes off the hit
    // and never the damage. Folded into the bonus so the log shows one number.
    const toHit = `1d20${fmtBonus(attack.attackBonus + penalty)}`;
    const notation =
      what === 'hit'
        ? mode === 'flat'
          ? toHit
          : withAdvantage(toHit, mode)
        : two
          ? attack.versatileDamage
          : attack.damage;
    if (!notation) return;
    const at = target
      ? ` vs ${target.name}${target.feet !== null ? ` · ${target.feet} ft` : ''}`
      : '';
    const label = `${attack.name} · ${what === 'hit' ? 'to hit' : 'damage'}${at}`;
    const res = await rollAction(campaignId, {
      notation,
      label: label.slice(0, 80),
      characterId,
      visibility: 'table',
    });
    if (!res.ok) {
      onError(res.error ?? 'The dice did not land.');
      return;
    }
    await tray.showNotationRoll(res.data, {
      title: attack.name,
      hint: `${what === 'hit' ? 'to hit' : 'damage'}${at}`,
    });
  };

  const inRange = (
    attack: WeaponAttack
  ): 'reach' | 'range' | 'long' | 'out' | null => {
    if (!target || target.feet === null) return null;
    const reach = attack.properties.some(p => /reach/i.test(p)) ? 10 : 5;
    if (attack.range === 0) return target.feet <= reach ? 'reach' : 'out';
    if (target.feet <= attack.range) return 'range';
    if (attack.longRange && target.feet <= attack.longRange) return 'long';
    return 'out';
  };

  /* --- render ----------------------------------------------------------- */

  if (!characterId) {
    return (
      <p className="py-1 text-xs text-ink-subtle">
        No character seated here. Nothing to swing.
      </p>
    );
  }
  if (attacks === null) {
    return <p className="py-1 text-xs text-ink-subtle">Reaching for them…</p>;
  }
  if (attacks.length === 0) {
    return (
      <p className="py-1 text-xs text-ink-subtle">
        Nothing in hand. Equip a weapon under Your hero and it appears here.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
          {(['disadvantage', 'flat', 'advantage'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-2 py-0.5 text-[0.7rem] transition-colors ${
                mode === m
                  ? 'bg-gold font-medium text-bg'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {m === 'flat' ? 'straight' : m === 'advantage' ? 'adv' : 'dis'}
            </button>
          ))}
        </div>
        {target ? (
          <span className="flex items-center gap-1 text-xs text-ink">
            <Glyph name="target" size={12} className="text-danger" />
            {target.name}
            {target.feet !== null && (
              <span className="tabular-nums text-ink-subtle">
                · {target.feet} ft
              </span>
            )}
          </span>
        ) : (
          <Marginalia dash>tap a foe on the board to aim</Marginalia>
        )}
      </div>
      {(advice.because.length > 0 || penalty !== 0) && (
        <p className="text-[0.7rem] text-warning">
          {[
            ...advice.because,
            penalty !== 0 ? `Exhaustion · ${penalty} to hit` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {target && target.conditions.length > 0 && (
        <TargetAdvice conditions={target.conditions} name={target.name} />
      )}

      <ul className="divide-y divide-line">
        {attacks.map(a => {
          const range = inRange(a);
          const two = twoHanded.has(a.itemId);
          return (
            <li key={a.itemId} className="py-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm text-ink">{a.name}</span>
                <span className="font-mono text-xs text-ink-muted">
                  {fmtBonus(a.attackBonus)} ·{' '}
                  {two && a.versatileDamage ? a.versatileDamage : a.damage}
                  {a.damageType ? ` ${a.damageType}` : ''}
                </span>
                {a.range > 0 && (
                  <span className="text-[0.65rem] text-ink-subtle">
                    {a.range}/{a.longRange} ft
                  </span>
                )}
                {range && (
                  <span
                    className={`text-[0.65rem] uppercase tracking-[0.1em] ${
                      range === 'out'
                        ? 'text-danger'
                        : range === 'long'
                          ? 'text-warning'
                          : 'text-success'
                    }`}
                  >
                    {range === 'reach'
                      ? 'in reach'
                      : range === 'range'
                        ? 'in range'
                        : range === 'long'
                          ? 'long shot'
                          : 'out of reach'}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  color="primary"
                  className="h-6 min-w-0 px-2 text-xs"
                  onPress={() => roll(a, 'hit')}
                >
                  Hit
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  className="h-6 min-w-0 px-2 text-xs"
                  isDisabled={!a.damage}
                  onPress={() => roll(a, 'damage')}
                >
                  Damage
                </Button>
                {a.versatileDamage && (
                  <Tooltip content="Versatile: two hands for the bigger die.">
                    <button
                      type="button"
                      onClick={() =>
                        setTwoHanded(prev => {
                          const next = new Set(prev);
                          if (next.has(a.itemId)) next.delete(a.itemId);
                          else next.add(a.itemId);
                          return next;
                        })
                      }
                      className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                        two
                          ? 'border-gold bg-gold/15 text-gold-strong dark:text-gold'
                          : 'border-line text-ink-subtle'
                      }`}
                    >
                      two hands
                    </button>
                  </Tooltip>
                )}
                {a.mastery && (
                  <span className="text-[0.65rem] text-arcane">
                    {a.mastery}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
