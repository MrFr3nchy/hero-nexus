'use client';

import {
  Button,
  NumberInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import { useState } from 'react';

import { Glyph } from '@/@shared/components/ui';
import type { WorldClock } from '@/server/world-time';
import {
  CLOCK_STEPS,
  clock as clockOf,
  format,
  stepMinutes,
  timeOfDay,
  weekday,
  type WorldTime,
} from '../../lib/calendar';
import {
  advanceTimeAction,
  setWorldTimeAction,
  startWorldClockAction,
  stopWorldClockAction,
} from '../../time-actions';

/**
 * The world's clock on the mode bar (10).
 *
 * Everyone reads it — "Dawn · 3rd of Mirtul" — and staff get the hand that
 * moves it: the fixed steps, to dawn, to dusk, and a set. A table that is
 * not counting shows nothing to a player and a *Start the clock* to staff;
 * the calendar itself is on the manage page, because it changes once.
 */
export function WorldClockControl({
  campaignId,
  clock,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  clock: WorldClock;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<WorldTime | null>(null);
  const def = clock.calendar;
  const time = clock.time;

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'That did not take.');
    await refresh();
  };

  if (!time) {
    if (!isStaff) return null;
    return (
      <Tooltip content="Start the world's clock at dawn on the first day. The calendar is on the manage page.">
        <Button
          size="sm"
          variant="light"
          className="h-7 min-w-0 px-2 text-xs text-ink-subtle"
          isDisabled={busy}
          onPress={() => act(startWorldClockAction(campaignId))}
        >
          <Glyph name="hourglass" size={12} />
          Start the clock
        </Button>
      </Tooltip>
    );
  }

  const line = `${timeOfDay(def, time)} · ${format(def, time, 'short')}`;
  const title = `${weekday(def, time)}, ${format(def, time, 'datetime')}`;

  if (!isStaff) {
    return (
      <Tooltip content={title}>
        <span className="inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle">
          <Glyph name="hourglass" size={11} />
          {line}
        </span>
      </Tooltip>
    );
  }

  const d = draft ?? time;
  const month = def.months[d.month - 1] ?? def.months[0];

  return (
    <Popover
      placement="bottom-start"
      isOpen={open}
      onOpenChange={v => {
        setOpen(v);
        if (v) setDraft(time);
      }}
    >
      <PopoverTrigger>
        <button
          type="button"
          title={title}
          className="inline-flex items-center gap-1 rounded-[5px] border border-line px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle transition-colors hover:border-gold/50 hover:text-ink"
        >
          <Glyph name="hourglass" size={11} />
          {line}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 border border-line bg-surface p-3">
        <div className="w-full space-y-3">
          <p className="text-xs text-ink-subtle">{title}</p>
          <div className="flex flex-wrap gap-1">
            {CLOCK_STEPS.map(step => (
              <Button
                key={step.key}
                size="sm"
                variant="flat"
                className="h-7 min-w-0 px-2 text-xs"
                isDisabled={busy}
                onPress={() =>
                  act(
                    advanceTimeAction(
                      campaignId,
                      stepMinutes(def, time, step),
                      'The DM'
                    )
                  )
                }
              >
                {step.label}
              </Button>
            ))}
          </div>
          <div className="space-y-2 border-t border-line pt-2">
            <p className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
              Set the clock
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <NumberInput
                size="sm"
                label="Year"
                value={d.year}
                onValueChange={v =>
                  setDraft({
                    ...d,
                    year: Number.isFinite(v) ? Math.trunc(v) : d.year,
                  })
                }
              />
              <Select
                size="sm"
                label="Month"
                className="col-span-2"
                selectedKeys={[String(d.month)]}
                onSelectionChange={keys => {
                  const k = Array.from(keys)[0];
                  if (k) setDraft({ ...d, month: Number(k), day: 1 });
                }}
              >
                {def.months.map((m, i) => (
                  <SelectItem key={String(i + 1)} textValue={m.name}>
                    {m.name}
                    {m.days !== 30 && m.days !== 31 ? ` (${m.days})` : ''}
                  </SelectItem>
                ))}
              </Select>
              <NumberInput
                size="sm"
                label="Day"
                minValue={1}
                maxValue={Math.max(1, month.days)}
                value={d.day}
                onValueChange={v =>
                  setDraft({
                    ...d,
                    day: Number.isFinite(v)
                      ? Math.max(
                          1,
                          Math.min(Math.max(1, month.days), Math.trunc(v))
                        )
                      : d.day,
                  })
                }
              />
              <NumberInput
                size="sm"
                label="Hour"
                minValue={0}
                maxValue={def.hoursPerDay - 1}
                value={Math.floor(d.minute / 60)}
                onValueChange={v =>
                  setDraft({
                    ...d,
                    minute:
                      (Number.isFinite(v)
                        ? Math.max(
                            0,
                            Math.min(def.hoursPerDay - 1, Math.trunc(v))
                          )
                        : Math.floor(d.minute / 60)) *
                        60 +
                      (d.minute % 60),
                  })
                }
              />
              <NumberInput
                size="sm"
                label="Minute"
                minValue={0}
                maxValue={59}
                value={d.minute % 60}
                onValueChange={v =>
                  setDraft({
                    ...d,
                    minute:
                      Math.floor(d.minute / 60) * 60 +
                      (Number.isFinite(v)
                        ? Math.max(0, Math.min(59, Math.trunc(v)))
                        : d.minute % 60),
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-subtle">
                {clockOf(def, d)}, {format(def, d, 'date')}
              </span>
              <Button
                size="sm"
                color="primary"
                className="h-7 min-w-0 px-2.5 text-xs"
                isDisabled={busy}
                onPress={async () => {
                  await act(setWorldTimeAction(campaignId, d));
                  setOpen(false);
                }}
              >
                Set
              </Button>
            </div>
          </div>
          <div className="border-t border-line pt-2">
            <Button
              size="sm"
              variant="light"
              className="h-6 min-w-0 px-1.5 text-xs text-ink-subtle"
              isDisabled={busy}
              onPress={async () => {
                await act(stopWorldClockAction(campaignId));
                setOpen(false);
              }}
            >
              Stop counting
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
