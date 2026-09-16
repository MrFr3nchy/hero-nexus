'use client';

import { Button, Tooltip } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSelectedToken } from '@/@shared/battlemap/selection';
import { FaceEntry, useDiceTray } from '@/@shared/components/dice';
import { Glyph, Marginalia } from '@/@shared/components/ui';
import { distanceFeet } from '@/@creator/campaign/lib/battlemap';
import { physicalDiceAllowed } from '@/@creator/campaign/lib/table-rules';
import { notationSides } from '@/@shared/lib/dice';
import {
  attackedWith,
  rollAdvice,
} from '@/@creator/campaign/lib/condition-effects';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import { fmtBonus, type WeaponAttack } from '@/@creator/character/lib/derive';
import type { Throwable } from '@/server/fight';
import type { LiveState } from '@/server/session';
import { rollAction } from '../../actions';
import {
  attackAction,
  getMyAttacksAction,
  listThrowablesAction,
  mySeatAction,
} from '../../fight-actions';
import {
  ammunitionFor,
  coverWords,
  outcomeWords,
  type RollOutcome,
} from '@/@creator/campaign/lib/attack';
import { coverBetween, flanked } from '@/@creator/campaign/lib/battlemap';
import { Refused, type RefusedState } from '../Refused';

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
 * versatile and the viewer says so. **Attack** is one press for both (06):
 * the server spends the action, rolls to hit with the target's state folded
 * in, compares against an AC it knows — raised by cover — rolls damage
 * (doubled dice on a natural 20), takes the target's defences off it, and
 * applies or proposes; the tray draws the hit then the damage, and the row
 * says what came of it. *Damage* alone is still here for the odd effect that
 * wants dice without a swing.
 *
 * It refuses only what the rules refuse under Enforce — a spent action, total
 * cover, an empty quiver — and staff may rule past. A long shot, a target
 * out of reach: the row says so in words and rolls anyway.
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
  const [refusal, setRefusal] = useState<RefusedState | null>(null);
  const [last, setLast] = useState<{
    itemId: string;
    outcome: RollOutcome;
    total: number;
  } | null>(null);
  const [improvised, setImprovised] = useState<{
    label: string;
    thrown: boolean;
    itemId: string;
  }>({ label: '', thrown: false, itemId: '' });
  const [throwables, setThrowables] = useState<Throwable[]>([]);
  const tray = useDiceTray();
  const selectedId = useSelectedToken(campaignId);

  useEffect(() => {
    mySeatAction(campaignId).then(setCharacterId);
  }, [campaignId]);

  const load = useCallback(async () => {
    if (!characterId) return;
    const [a, t] = await Promise.all([
      getMyAttacksAction(characterId, campaignId),
      listThrowablesAction(characterId, campaignId),
    ]);
    setAttacks(a);
    setThrowables(t);
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
    () =>
      rollAdvice(mine?.conditions ?? [], 'attack', null, {
        heavilyLaden: mine?.weight?.disadvantage,
      }),
    [mine?.conditions, mine?.weight?.disadvantage]
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
    // Cover and flanking off the board the viewer sees, so the aim line can
    // say "half cover +2" before the swing. The server prices them again
    // off the whole board; a player's fogged copy can only under-count.
    const others = board.tokens.filter(
      t => t.id !== token.id && t.id !== myToken?.id
    );
    const cover = myToken
      ? coverBetween(board.terrain, myToken, token, others)
      : 'none';
    const mySide = state.entries.find(e => e.characterId === characterId)?.side;
    const allies = others.filter(t => {
      const e = t.entryId ? state.entries.find(x => x.id === t.entryId) : null;
      return e && e.side === mySide;
    });
    return {
      token,
      entryId: entry?.id ?? null,
      // `||`, not `??`: a token's label is the empty string, not null, when
      // it has none — and a foe the DM has not named is "Something" here for
      // the same reason it is on the board's own status line.
      name: entry?.label || token.label || 'Something',
      feet: myToken ? distanceFeet(myToken, token) : null,
      conditions: parseConditions(entry?.conditionKeys ?? ''),
      cover,
      flanking:
        !!myToken && state.rules.flanking && flanked(myToken, token, allies),
    };
  }, [
    board,
    selectedId,
    myToken,
    state.entries,
    state.rules.flanking,
    characterId,
  ]);

  const myEntry = useMemo(
    () => state.entries.find(e => e.characterId === characterId) ?? null,
    [state.entries, characterId]
  );

  /**
   * The whole swing, one press. The tray draws the to-hit the server rolled,
   * then the damage, and the row keeps the verdict until the next swing. A
   * refusal shows where the press happened, with "Do it anyway" for staff.
   */
  const swing = async (
    weapon:
      | { kind: 'item'; itemId: string; twoHanded?: boolean }
      | {
          kind: 'improvised';
          label: string;
          thrown: boolean;
          itemId?: string | null;
        },
    title: string,
    ruling = false,
    real?: { hitFaces: number[]; damageFaces?: number[] }
  ) => {
    if (!myEntry) {
      onError('You are not in this fight yet — ask the DM to add the party.');
      return;
    }
    const res = await attackAction({
      attackerEntryId: myEntry.id,
      weapon,
      targetEntryId: target?.entryId ?? null,
      mode,
      ruling,
      ...(real ?? {}),
    });
    if (!res.ok) {
      if (res.overridable) {
        setRefusal({
          message: res.error,
          ruling: () => swing(weapon, title, true, real),
        });
      } else if (res.needFaces && real) {
        // The table's fold changed the handful — two d20s for advantage the
        // target gave, or doubled damage dice on a natural 20. Ask for
        // exactly those and send the swing again with them.
        const which = res.needFaces.which;
        setFaceAsk({
          message: res.error,
          sides: res.needFaces.sides,
          label: title,
          submit: faces =>
            swing(
              weapon,
              title,
              ruling,
              which === 'hit'
                ? { ...real, hitFaces: faces }
                : { ...real, damageFaces: faces }
            ),
        });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefusal(null);
    setFaceAsk(null);
    const { hit, damage, outcome, physical } = res.data;
    setLast({
      itemId: weapon.kind === 'item' ? weapon.itemId : 'improvised',
      outcome,
      total: hit.total,
    });
    const at = target ? ` vs ${target.name}` : '';
    await tray.showNotationRoll(hit, {
      title,
      hint: `to hit${at}${
        outcome.hit === true
          ? outcome.critical
            ? ' · critical'
            : ' · hit'
          : outcome.hit === false
            ? ' · miss'
            : ''
      }`,
      physical,
    });
    if (damage) {
      await tray.showNotationRoll(damage, {
        title,
        hint: `damage${at}${outcome.damage?.adjusted ? ` · ${outcome.damage.amount} lands` : ''}`,
        physical: physical && real?.damageFaces !== undefined,
      });
    }
  };

  /** Real dice at this table: the rule, or staff. */
  const isStaff = state.role === 'gm' || state.role === 'co-gm';
  const physicalDice = physicalDiceAllowed(state.rules, isStaff);
  /** The server asked for a different handful; the boxes for it. */
  const [faceAsk, setFaceAsk] = useState<{
    message: string;
    sides: number[];
    label: string;
    submit: (faces: number[]) => Promise<void>;
  } | null>(null);
  /** The d20s the picker's mode throws, then the weapon's damage dice. */
  const facesFor = (damage: string | null): number[] => [
    ...(mode === 'flat' ? [20] : [20, 20]),
    ...(damage ? (notationSides(damage) ?? []) : []),
  ];

  /* --- rolling ---------------------------------------------------------- */

  /** Damage dice alone, for an effect that wants them without a swing. */
  const rollDamage = async (attack: WeaponAttack) => {
    if (!characterId) return;
    const two = twoHanded.has(attack.itemId) && attack.versatileDamage;
    const notation = two ? attack.versatileDamage : attack.damage;
    if (!notation) return;
    const at = target
      ? ` vs ${target.name}${target.feet !== null ? ` · ${target.feet} ft` : ''}`
      : '';
    const res = await rollAction(campaignId, {
      notation,
      label: `${attack.name} · damage${at}`.slice(0, 80),
      characterId,
      visibility: 'table',
    });
    if (!res.ok) {
      onError(res.error ?? 'The dice did not land.');
      return;
    }
    await tray.showNotationRoll(res.data, {
      title: attack.name,
      hint: `damage${at}`,
    });
  };

  /** "arrows" beside a bow — the word only; the count lives in the pack. */
  const ammo = (attack: WeaponAttack): string | null => {
    const word = ammunitionFor(attack.name, attack.properties);
    return word ? `${word}s` : null;
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
            {target.cover !== 'none' && (
              <span
                className={
                  target.cover === 'total' ? 'text-danger' : 'text-warning'
                }
              >
                · {coverWords(target.cover)}
              </span>
            )}
            {target.flanking && (
              <span className="text-success">· flanking</span>
            )}
          </span>
        ) : (
          <Marginalia dash>tap a foe on the board to aim</Marginalia>
        )}
      </div>
      {refusal && (
        <Refused refusal={refusal} onDismiss={() => setRefusal(null)} />
      )}
      {faceAsk && (
        <div className="space-y-1">
          <p className="text-xs text-ink-muted">{faceAsk.message}</p>
          <FaceEntry
            inline
            sides={faceAsk.sides}
            label={faceAsk.label}
            onSubmit={faceAsk.submit}
            onCancel={() => setFaceAsk(null)}
          />
        </div>
      )}
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
                  onPress={() =>
                    swing(
                      { kind: 'item', itemId: a.itemId, twoHanded: two },
                      a.name
                    )
                  }
                >
                  Attack
                </Button>
                {physicalDice && (
                  <FaceEntry
                    compact
                    sides={facesFor(
                      two && a.versatileDamage ? a.versatileDamage : a.damage
                    )}
                    label={a.name}
                    onSubmit={faces => {
                      const d20s = mode === 'flat' ? 1 : 2;
                      return swing(
                        { kind: 'item', itemId: a.itemId, twoHanded: two },
                        a.name,
                        false,
                        {
                          hitFaces: faces.slice(0, d20s),
                          damageFaces:
                            faces.length > d20s ? faces.slice(d20s) : undefined,
                        }
                      );
                    }}
                  />
                )}
                <Button
                  size="sm"
                  variant="flat"
                  className="h-6 min-w-0 px-2 text-xs"
                  isDisabled={!a.damage}
                  onPress={() => rollDamage(a)}
                >
                  Damage
                </Button>
                {ammo(a) && (
                  <span className="text-[0.65rem] tabular-nums text-ink-subtle">
                    {ammo(a)}
                  </span>
                )}
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
              {last?.itemId === a.itemId && (
                <Verdict outcome={last.outcome} total={last.total} />
              )}
            </li>
          );
        })}
        {/* Anything to hand: 1d4 + STR, or DEX thrown at 20/60, no
            proficiency. A chair, a tankard, the goblin's own spear. */}
        <li className="py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-ink">Improvised</span>
            {/* Something from the pack (09), or anything typed. A heavy
                thing is listed and marked; the server refuses the throw
                under Enforce and the DM may rule it flies. */}
            {throwables.length > 0 && (
              <select
                aria-label="A thing from the pack"
                value={improvised.itemId}
                onChange={e =>
                  setImprovised(s => ({ ...s, itemId: e.target.value }))
                }
                className="h-6 max-w-36 rounded border border-line bg-surface-2 px-1 text-xs text-ink"
              >
                <option value="">from the pack…</option>
                {throwables.map(t => (
                  <option key={t.itemId} value={t.itemId}>
                    {t.name} · {t.weight} lb{t.heavy ? ' · heavy' : ''}
                  </option>
                ))}
              </select>
            )}
            {!improvised.itemId && (
              <input
                type="text"
                aria-label="What is thrown or swung"
                placeholder="a chair"
                value={improvised.label}
                onChange={e =>
                  setImprovised(s => ({ ...s, label: e.target.value }))
                }
                className="h-6 w-28 rounded border border-line bg-surface-2 px-1.5 text-xs text-ink placeholder:text-ink-subtle"
              />
            )}
            <button
              type="button"
              onClick={() => setImprovised(s => ({ ...s, thrown: !s.thrown }))}
              className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                improvised.thrown
                  ? 'border-gold bg-gold/15 text-gold-strong dark:text-gold'
                  : 'border-line text-ink-subtle'
              }`}
            >
              thrown 20/60
            </button>
            <Button
              size="sm"
              color="primary"
              className="h-6 min-w-0 px-2 text-xs"
              onPress={() =>
                swing(
                  {
                    kind: 'improvised',
                    label: improvised.label,
                    thrown: improvised.thrown,
                    itemId: improvised.itemId || null,
                  },
                  (improvised.itemId
                    ? throwables.find(t => t.itemId === improvised.itemId)
                        ?.name
                    : improvised.label.trim()) || 'Improvised'
                )
              }
            >
              Attack
            </Button>
            <span className="font-mono text-xs text-ink-muted">
              1d4 {improvised.thrown ? '+ DEX' : '+ STR'} bludgeoning
            </span>
          </div>
          {last?.itemId === 'improvised' && (
            <Verdict outcome={last.outcome} total={last.total} />
          )}
        </li>
      </ul>
    </div>
  );
}

/** What the last swing with this weapon came to, under its row. */
function Verdict({ outcome, total }: { outcome: RollOutcome; total: number }) {
  const tone =
    outcome.hit === true
      ? 'text-success'
      : outcome.hit === false
        ? 'text-danger'
        : 'text-ink-muted';
  return (
    <p className={`mt-1 text-xs ${tone}`}>
      {outcome.targetLabel ? `${outcome.targetLabel} · ` : ''}
      {outcomeWords(outcome, total)}
      {outcome.because.length > 0 && (
        <span className="text-ink-subtle">
          {' '}
          · {outcome.because.join(' · ')}
        </span>
      )}
      {outcome.applied && <span className="text-ink-subtle"> · applied</span>}
    </p>
  );
}
