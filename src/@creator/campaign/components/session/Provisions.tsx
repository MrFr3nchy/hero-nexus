'use client';

import { Button, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { Glyph } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import { markProvisionedAction } from '../../time-actions';

/**
 * Provisions (10): the road's tally, per hero, for the DM.
 *
 * Drawn only while one of the table's `survival` rules is on — off, the
 * day tick counts nothing and there is nothing to say. What it shows is
 * what the tick reads: rations carried (eaten one a day, by name), days
 * without food and water, hours since the last long rest. The three verbs
 * are the DM saying the party ate, drank or slept somewhere the tick could
 * not see — an inn, a stream, a night on watch that still counted — and
 * each zeroes its own count.
 */
export function Provisions({
  campaignId,
  state,
  refresh,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const rules = state.rules.survival;
  if (!rules.food && !rules.water && !rules.sleep) return null;
  if (state.party.length === 0) return null;

  const mark = async (
    characterId: string,
    what: { food?: boolean; water?: boolean; slept?: boolean }
  ) => {
    setBusy(true);
    const res = await markProvisionedAction(campaignId, characterId, what);
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    await refresh();
  };

  return (
    <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
        <Glyph name="tankard" size={12} />
        Provisions
        {!state.clock.time && (
          <span className="normal-case tracking-normal">
            · the clock is not counting, so nothing is eaten
          </span>
        )}
      </p>
      <ul className="mt-1.5 divide-y divide-line/60">
        {state.party.map(p => {
          const hungry = rules.food && p.survival.daysWithoutFood > 0;
          const dry = rules.water && p.survival.daysWithoutWater > 0;
          const tired = rules.sleep && p.survival.hoursAwake >= 16;
          return (
            <li
              key={p.characterId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {p.name}
              </span>
              {rules.food && (
                <Tooltip content="Rations carried, eaten one a day. Then the hungry days.">
                  <span
                    className={`tabular-nums ${hungry ? 'text-danger' : 'text-ink-subtle'}`}
                  >
                    {p.rations} ration{p.rations === 1 ? '' : 's'}
                    {hungry ? ` · ${p.survival.daysWithoutFood}d hungry` : ''}
                  </span>
                </Tooltip>
              )}
              {rules.water && (
                <span
                  className={`tabular-nums ${dry ? 'text-danger' : 'text-ink-subtle'}`}
                >
                  {dry ? `${p.survival.daysWithoutWater}d dry` : 'watered'}
                </span>
              )}
              {rules.sleep && (
                <span
                  className={`tabular-nums ${tired ? 'text-warning' : 'text-ink-subtle'}`}
                >
                  {p.survival.hoursAwake}h awake
                </span>
              )}
              <span className="flex gap-0.5">
                {rules.food && (
                  <Button
                    size="sm"
                    variant="light"
                    className="h-6 min-w-0 px-1.5 text-xs text-ink-muted"
                    isDisabled={busy}
                    onPress={() => mark(p.characterId, { food: true })}
                  >
                    fed
                  </Button>
                )}
                {rules.water && (
                  <Button
                    size="sm"
                    variant="light"
                    className="h-6 min-w-0 px-1.5 text-xs text-ink-muted"
                    isDisabled={busy}
                    onPress={() => mark(p.characterId, { water: true })}
                  >
                    watered
                  </Button>
                )}
                {rules.sleep && (
                  <Button
                    size="sm"
                    variant="light"
                    className="h-6 min-w-0 px-1.5 text-xs text-ink-muted"
                    isDisabled={busy}
                    onPress={() => mark(p.characterId, { slept: true })}
                  >
                    slept
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
