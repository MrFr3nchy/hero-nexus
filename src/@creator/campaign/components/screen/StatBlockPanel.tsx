'use client';

import { Button } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';

import { useSelectedToken } from '@/@shared/battlemap/selection';
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
  const groups: { title: string; items: { name: string; desc: string }[] }[] = [
    { title: 'Actions', items: data.actions },
    { title: 'Bonus actions', items: data.bonus_actions },
    { title: 'Reactions', items: data.reactions },
    { title: 'Legendary', items: data.legendary_actions },
  ].filter(g => g.items.length > 0);

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
                    <span className="text-ink-muted">{a.desc}</span>
                  </p>
                  {(r.hit || r.damage.length > 0) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.hit && (
                        <Button
                          size="sm"
                          color="primary"
                          className="h-6 min-w-0 px-2 text-xs"
                          onPress={() => roll(a.name, r.hit!, 'to hit')}
                        >
                          Hit {r.hit.replace('1d20', '')}
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
