'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@heroui/react';

import {
  conditionDef,
  parseConditions,
} from '@/@creator/campaign/lib/conditions';
import {
  effectDetail,
  effectName,
  type EffectRow,
} from '@/@creator/campaign/lib/effects';
import {
  adjustEffectRoundsAction,
  removeEffectAction,
} from '../../effect-actions';
import { updateEntryAction } from '../../actions';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/** One chip's skin, by what it is and how bad. */
function skinFor(
  tone: 'warning' | 'danger' | 'arcane' | 'gold' | 'muted'
): string {
  switch (tone) {
    case 'danger':
      return 'border-danger/40 bg-danger/10 text-danger';
    case 'warning':
      return 'border-warning/40 bg-warning/10 text-warning';
    case 'arcane':
      return 'border-arcane/40 bg-arcane/10 text-arcane';
    case 'gold':
      return 'border-gold/50 bg-gold/10 text-gold-strong dark:text-gold';
    default:
      return 'border-line text-ink-subtle';
  }
}

interface Chip {
  key: string;
  name: string;
  /** "3" beside the name when a clock is on it. */
  count: number | null;
  /** The tooltip: duration, save, source. */
  detail: string;
  tone: 'warning' | 'danger' | 'arcane';
  /** The row behind it, when there is one. A bare condition has none. */
  row: EffectRow | null;
  /** For a bare condition: the key to take off the entry. */
  conditionKey: string | null;
  hidden: boolean;
}

/**
 * What a combatant is under, as chips — conditions first in the canonical
 * order, then named effects — each with its rounds left when it has a clock.
 *
 * Read-only for a player; for staff each chip opens a small popover with the
 * count, ±1 round, and "Lift". `effects` is every row on the fight; the ones
 * for this entry are picked out here so the caller passes one list around.
 */
export function EffectChips({
  entryId,
  conditionKeys,
  effects,
  isStaff,
  act,
  size = 'sm',
}: {
  entryId: string;
  conditionKeys: string;
  effects: EffectRow[];
  isStaff: boolean;
  act?: Act;
  size?: 'sm' | 'xs';
}) {
  const mine = effects.filter(e => e.entryId === entryId);
  const chips: Chip[] = [];

  for (const key of parseConditions(conditionKeys)) {
    const def = conditionDef(key);
    if (!def) continue;
    const row =
      mine.find(e => e.kind === 'condition' && e.conditionKey === key) ?? null;
    chips.push({
      key: `c:${key}`,
      name: def.label,
      count: row?.roundsLeft ?? null,
      detail: row ? `${def.hint} · ${effectDetail(row)}` : def.hint,
      tone: def.tone,
      row,
      conditionKey: key,
      hidden: row?.visibility === 'dm',
    });
  }
  for (const row of mine.filter(e => e.kind === 'effect')) {
    chips.push({
      key: `e:${row.id}`,
      name: effectName(row),
      count: row.roundsLeft,
      detail: effectDetail(row),
      tone: 'arcane',
      row,
      conditionKey: null,
      hidden: row.visibility === 'dm',
    });
  }
  if (chips.length === 0) return null;

  const text = size === 'xs' ? 'text-[0.55rem]' : 'text-[0.6rem]';

  return (
    <>
      {chips.map(chip => {
        const face = (
          <span
            className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 ${text} uppercase tracking-[0.08em] ${skinFor(chip.tone)} ${
              chip.hidden ? 'border-dashed' : ''
            }`}
          >
            {chip.name}
            {chip.count !== null && (
              <span className="font-display normal-case tracking-normal tabular-nums opacity-90">
                · {chip.count}
              </span>
            )}
          </span>
        );

        if (!isStaff || !act) {
          return (
            <Tooltip key={chip.key} content={chip.detail}>
              {face}
            </Tooltip>
          );
        }

        return (
          <Popover key={chip.key} placement="bottom-start">
            <PopoverTrigger>
              <button
                type="button"
                aria-label={`${chip.name}${chip.count !== null ? `, ${chip.count} rounds left` : ''}`}
                className="rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-gold"
              >
                {face}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 border border-line bg-surface p-2.5">
              <div className="w-full space-y-2">
                <p className="text-sm font-medium text-ink">{chip.name}</p>
                <p className="text-xs leading-snug text-ink-muted">
                  {chip.detail}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {chip.row && chip.row.roundsLeft !== null && (
                    <>
                      <Button
                        size="sm"
                        variant="flat"
                        aria-label="One round fewer"
                        className="min-w-0 px-2"
                        isDisabled={chip.row.roundsLeft <= 1}
                        onPress={() =>
                          act(adjustEffectRoundsAction(chip.row!.id, -1))
                        }
                      >
                        −
                      </Button>
                      <span className="w-14 text-center font-display text-sm tabular-nums text-ink">
                        {chip.row.roundsLeft}{' '}
                        <span className="text-xs text-ink-subtle">
                          {chip.row.roundsLeft === 1 ? 'round' : 'rounds'}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="flat"
                        aria-label="One round more"
                        className="min-w-0 px-2"
                        onPress={() =>
                          act(adjustEffectRoundsAction(chip.row!.id, 1))
                        }
                      >
                        +
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="light"
                    className="ml-auto text-ink-subtle data-[hover=true]:text-danger"
                    onPress={() => {
                      if (chip.row) {
                        act(removeEffectAction(chip.row.id));
                        return;
                      }
                      // A bare condition has no row; the key comes off the
                      // entry through the same writer the picker uses.
                      act(
                        updateEntryAction(entryId, {
                          conditionKeys: parseConditions(conditionKeys)
                            .filter(k => k !== chip.conditionKey)
                            .join(','),
                        })
                      );
                    }}
                  >
                    Lift it
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </>
  );
}

/**
 * The room's clocks, as their own rows at the top of the order — gold, with
 * the label and the rounds left. A hidden one is dashed and reaches staff
 * only (the server already dropped it for a player).
 */
export function CountdownRows({
  effects,
  isStaff,
  act,
}: {
  effects: EffectRow[];
  isStaff: boolean;
  act?: Act;
}) {
  const clocks = effects.filter(e => e.kind === 'countdown');
  if (clocks.length === 0) return null;
  return (
    <>
      {clocks.map(c => (
        <li
          key={c.id}
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-2 py-2 ${skinFor('gold')} ${
            c.visibility === 'dm' ? 'border-dashed' : ''
          }`}
        >
          <span className="w-8 shrink-0 text-center font-display text-lg tabular-nums">
            {c.roundsLeft ?? '—'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">{c.label}</p>
            <p className="text-xs text-ink-subtle">
              {c.roundsLeft === 1
                ? 'at the top of next round'
                : `in ${c.roundsLeft} rounds`}
              {c.visibility === 'dm' && ' · behind the screen'}
            </p>
          </div>
          {isStaff && act && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="light"
                aria-label="One round fewer"
                className="min-w-0 px-2 text-ink-muted"
                isDisabled={(c.roundsLeft ?? 0) <= 1}
                onPress={() => act(adjustEffectRoundsAction(c.id, -1))}
              >
                −
              </Button>
              <Button
                size="sm"
                variant="light"
                aria-label="One round more"
                className="min-w-0 px-2 text-ink-muted"
                onPress={() => act(adjustEffectRoundsAction(c.id, 1))}
              >
                +
              </Button>
              <Button
                size="sm"
                variant="light"
                aria-label={`Stop ${c.label}`}
                className="min-w-0 px-2 text-ink-subtle data-[hover=true]:text-danger"
                onPress={() => act(removeEffectAction(c.id))}
              >
                ✕
              </Button>
            </div>
          )}
        </li>
      ))}
    </>
  );
}
