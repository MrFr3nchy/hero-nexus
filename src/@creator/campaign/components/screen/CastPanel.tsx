'use client';

import { Button, Select, SelectItem, Switch, Tooltip } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useLitArea } from '@/@shared/battlemap/area';
import { useSelectedTokens } from '@/@shared/battlemap/selection';
import { Glyph, Marginalia } from '@/@shared/components/ui';
import { ABILITY_LABELS } from '@/@creator/character/schema';
import type { CastableSpell } from '@/server/casting';
import type { LiveState } from '@/server/session';
import { castSpellAction, listCastableAction } from '../../casting-actions';
import { Refused, type RefusedState } from '../Refused';

/**
 * Cast a spell (07): pick it, pick the slot, and the target is whatever the
 * board has — the tokens selected, or the area lit with the Area tool — or,
 * at the desk, a party member. One tap after that; the server pays, rolls,
 * asks and lands it, and the line under the spell says what came of it.
 *
 * A fellow hero is asked before the spell touches them; the line says so and
 * the slot waits on their yes.
 */
export function CastPanel({
  campaignId,
  characterId,
  state,
  onError,
}: {
  campaignId: string;
  characterId: string;
  state: LiveState;
  onError: (message: string) => void;
}) {
  const [spells, setSpells] = useState<CastableSpell[] | null>(null);
  const [slotLevel, setSlotLevel] = useState<Record<string, number>>({});
  const [ritual, setRitual] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<RefusedState | null>(null);
  const [last, setLast] = useState<{ key: string; words: string } | null>(null);
  const [deskTarget, setDeskTarget] = useState<string>('');
  const selectedIds = useSelectedTokens(campaignId);
  const lit = useLitArea(campaignId);

  const load = useCallback(async () => {
    setSpells(await listCastableAction(campaignId, characterId));
  }, [campaignId, characterId]);
  const mine = useMemo(
    () => state.party.find(p => p.characterId === characterId) ?? null,
    [state.party, characterId]
  );
  useEffect(() => {
    load();
  }, [load, mine?.loadoutKey]);

  const inFight = !!state.encounter?.isActive;
  const board = state.battlemap;

  /* Who the spell lands on: the lit area, else the selected tokens, else at
     the desk a party member. */
  const targets = useMemo(() => {
    if (lit && lit.entryIds.length > 0) {
      return {
        kind: 'area' as const,
        area: lit.area,
        labels: lit.labels,
      };
    }
    if (board && selectedIds.length > 0) {
      const ids: string[] = [];
      const labels: string[] = [];
      for (const id of selectedIds) {
        const t = board.tokens.find(x => x.id === id);
        const e = t?.entryId
          ? state.entries.find(x => x.id === t.entryId)
          : null;
        if (e) {
          ids.push(e.id);
          labels.push(e.label);
        }
      }
      if (ids.length > 0) return { kind: 'entries' as const, ids, labels };
    }
    if (!inFight && deskTarget) {
      const p = state.party.find(x => x.characterId === deskTarget);
      return {
        kind: 'characters' as const,
        ids: [deskTarget],
        labels: [p?.name ?? 'somebody'],
      };
    }
    return { kind: 'none' as const, labels: [] as string[] };
  }, [
    lit,
    board,
    selectedIds,
    state.entries,
    state.party,
    inFight,
    deskTarget,
  ]);

  const cast = async (spell: CastableSpell, ruling = false) => {
    setBusy(spell.key);
    const level =
      spell.level === 0 ? null : (slotLevel[spell.key] ?? spell.level);
    const res = await castSpellAction({
      campaignId,
      characterId,
      spellKey: spell.key,
      slotLevel: level,
      ritual: ritual && spell.ritual,
      targets:
        targets.kind === 'area'
          ? { area: targets.area }
          : targets.kind === 'entries'
            ? { entryIds: targets.ids }
            : targets.kind === 'characters'
              ? { characterIds: targets.ids }
              : { none: true },
      ruling,
    });
    setBusy(null);
    if (!res.ok) {
      if (res.overridable) {
        setRefusal({ message: res.error, ruling: () => cast(spell, true) });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefusal(null);
    const d = res.data;
    const words = [
      ...d.landed.map(l =>
        [
          l.targetLabel,
          l.verdict === 'asked' ? 'asked to save' : l.verdict,
          l.damage !== null && l.damage > 0 ? `${l.damage} damage` : '',
          l.healing !== null && l.healing > 0 ? `${l.healing} healed` : '',
          l.condition ? l.condition : '',
        ]
          .filter(Boolean)
          .join(' · ')
      ),
      ...(d.consentFrom.length > 0
        ? [`waiting on ${d.consentFrom.join(', ')}`]
        : []),
      ...(!d.paid && d.consentFrom.length > 0
        ? ['slot held until they answer']
        : []),
    ];
    setLast({ key: spell.key, words: words.join(' — ') || 'cast' });
  };

  if (spells === null) {
    return (
      <p className="py-1 text-xs text-ink-subtle">Opening the spellbook…</p>
    );
  }
  const shown = spells.filter(s => showAll || s.prepared);
  if (spells.length === 0) {
    return (
      <p className="py-1 text-xs text-ink-subtle">
        No spells on the sheet. Nothing to cast.
      </p>
    );
  }

  const slotsLeft = (level: number) => mine?.slots.find(s => s.level === level);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Glyph name="sparkle" size={12} className="text-arcane" />
        {targets.kind === 'none' ? (
          <Marginalia dash>
            {inFight
              ? 'tap a token, or light an area, to aim'
              : 'pick a party member below, or cast with no target'}
          </Marginalia>
        ) : (
          <span className="text-ink">
            on {targets.labels.join(', ')}
            {targets.kind === 'area' && (
              <span className="text-ink-subtle"> · the lit area</span>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <Switch size="sm" isSelected={showAll} onValueChange={setShowAll}>
            <span className="text-xs text-ink-muted">All known</span>
          </Switch>
          <Tooltip content="No slot, ten minutes longer. Only spells marked ritual.">
            <Switch size="sm" isSelected={ritual} onValueChange={setRitual}>
              <span className="text-xs text-ink-muted">Ritual</span>
            </Switch>
          </Tooltip>
        </span>
      </div>

      {!inFight && state.party.length > 0 && (
        <Select
          size="sm"
          aria-label="Cast on"
          placeholder="Cast on…"
          className="w-full"
          selectedKeys={deskTarget ? [deskTarget] : []}
          onSelectionChange={keys => {
            const key = Array.from(keys)[0];
            setDeskTarget(key ? String(key) : '');
          }}
        >
          {state.party.map(p => (
            <SelectItem key={p.characterId} textValue={p.name}>
              {p.name}
              {p.characterId === characterId ? ' (you)' : ''}
            </SelectItem>
          ))}
        </Select>
      )}

      {refusal && (
        <Refused refusal={refusal} onDismiss={() => setRefusal(null)} />
      )}

      <ul className="divide-y divide-line">
        {shown.map(sp => {
          const level = sp.level === 0 ? null : (slotLevel[sp.key] ?? sp.level);
          const slot = level ? slotsLeft(level) : null;
          const none =
            level !== null &&
            slot !== undefined &&
            slot !== null &&
            slot.total - slot.expended <= 0;
          const what = [
            sp.attack ? 'spell attack' : '',
            sp.save
              ? `${ABILITY_LABELS[sp.save]} save${sp.saveEffect === 'half' ? ', half' : ''}`
              : '',
            sp.damage ? sp.damage : '',
            sp.healing ? `heals ${sp.healing}` : '',
            sp.area ? `${sp.area.size} ft ${sp.area.shape}` : '',
            sp.concentration ? 'concentration' : '',
            sp.condition ? sp.condition : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={sp.key} className="py-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={`text-sm ${sp.prepared ? 'text-ink' : 'text-ink-subtle'}`}
                >
                  {sp.name}
                </span>
                <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
                  {sp.level === 0 ? 'cantrip' : `level ${sp.level}`}
                  {sp.ritual ? ' · ritual' : ''}
                </span>
                {what && (
                  <span className="text-[0.7rem] text-ink-muted">{what}</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  color="primary"
                  className="h-6 min-w-0 px-2 text-xs"
                  isDisabled={busy !== null}
                  isLoading={busy === sp.key}
                  onPress={() => cast(sp)}
                >
                  Cast
                </Button>
                {sp.level > 0 && mine && (
                  <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
                    {mine.slots
                      .filter(s => s.level >= sp.level)
                      .map(s => (
                        <button
                          key={s.level}
                          type="button"
                          onClick={() =>
                            setSlotLevel(prev => ({
                              ...prev,
                              [sp.key]: s.level,
                            }))
                          }
                          className={`rounded px-1.5 py-0.5 text-[0.65rem] tabular-nums transition-colors ${
                            (slotLevel[sp.key] ?? sp.level) === s.level
                              ? 'bg-arcane font-medium text-bg'
                              : 'text-ink-muted hover:text-ink'
                          }`}
                          title={`${s.total - s.expended} of ${s.total} left`}
                        >
                          {s.level}
                          <span className="opacity-70">
                            ·{s.total - s.expended}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
                {none && !(ritual && sp.ritual) && (
                  <span className="text-[0.65rem] text-warning">
                    no slot left
                  </span>
                )}
              </div>
              {last?.key === sp.key && (
                <p className="mt-1 text-xs text-arcane">{last.words}</p>
              )}
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="py-2 text-xs text-ink-subtle">
            Nothing prepared today. Prepare spells under Your hero, or show all
            known.
          </li>
        )}
      </ul>
    </div>
  );
}
