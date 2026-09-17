'use client';

import { Button, Input } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiceSpinner,
  Glyph,
  Marginalia,
  SectionCard,
} from '@/@shared/components/ui';
import type {
  Availability,
  AvailabilityRow,
  AvailabilityWindow,
} from '@/server/scheduling';
import {
  listAvailabilityAction,
  setAvailabilityAction,
} from '../scheduling-actions';

/*
 * The table's calendar.
 *
 * A grid of days, one cell each; you click your own cell and it cycles
 * through free, maybe, busy and back to unknown, and the cell also says how
 * many at the table are free that day. That count is what the DM reads the
 * grid for, and it is the same grid everybody sees — a player choosing
 * which night to push for wants the same answer.
 */

const CYCLE: (Availability | null)[] = [null, 'yes', 'maybe', 'no'];

const STATUS_LABEL: Record<Availability, string> = {
  yes: 'Free',
  maybe: 'Maybe',
  no: 'Busy',
};

/** State colours: free, unsure, busy. Ornament that encodes state (rule 6). */
const STATUS_SKIN: Record<Availability, string> = {
  yes: 'border-success/60 bg-success/15 text-ink',
  maybe: 'border-warning/60 bg-warning/15 text-ink',
  no: 'border-danger/40 bg-danger/10 text-ink-muted',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A local calendar day as `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** The Monday on or before a day. */
function mondayOf(d: Date): Date {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const shift = (start.getDay() + 6) % 7;
  return addDays(start, -shift);
}

const WEEK_CHOICES = [1, 2, 4, 8] as const;

export function AvailabilityPanel({
  campaignId,
  viewerId,
}: {
  campaignId: string;
  viewerId: string;
}) {
  const [start, setStart] = useState(() => mondayOf(new Date()));
  const [weeks, setWeeks] = useState<(typeof WEEK_CHOICES)[number]>(4);
  const [cal, setCal] = useState<AvailabilityWindow | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const from = dayKey(start);
  const to = dayKey(addDays(start, weeks * 7 - 1));

  const refresh = useCallback(async () => {
    const res = await listAvailabilityAction(campaignId, from, to);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setCal(res.data);
  }, [campaignId, from, to]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const byDay = useMemo(() => {
    const map = new Map<string, AvailabilityRow[]>();
    for (const row of cal?.rows ?? []) {
      const list = map.get(row.day) ?? [];
      list.push(row);
      map.set(row.day, list);
    }
    return map;
  }, [cal]);

  const mine = (day: string): AvailabilityRow | undefined =>
    byDay.get(day)?.find(r => r.userId === viewerId);

  useEffect(() => {
    setNote(selected ? (mine(selected)?.note ?? '') : '');
    // `mine` closes over byDay; re-run when either changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, byDay]);

  const write = async (
    day: string,
    status: Availability | null,
    nextNote?: string
  ) => {
    // Optimistic: the grid answers the click, the server catches up.
    setCal(prev => {
      if (!prev) return prev;
      const rows = prev.rows.filter(
        r => !(r.day === day && r.userId === viewerId)
      );
      if (status) {
        const me = prev.seats.find(s => s.userId === viewerId);
        rows.push({
          userId: viewerId,
          name: me?.name ?? null,
          day,
          status,
          note: nextNote ?? mine(day)?.note ?? '',
        });
      }
      return { ...prev, rows };
    });
    const res = await setAvailabilityAction(campaignId, [
      { day, status, note: nextNote ?? mine(day)?.note ?? '' },
    ]);
    if (!res.ok) {
      setError(res.error);
      await refresh();
    }
  };

  const cycle = (day: string) => {
    const current = mine(day)?.status ?? null;
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    setSelected(day);
    write(day, next);
  };

  const today = dayKey(new Date());
  const days = Array.from({ length: weeks * 7 }, (_, i) =>
    dayKey(addDays(start, i))
  );
  const seats = cal?.seats ?? [];
  const selectedRows = selected ? (byDay.get(selected) ?? []) : [];
  const selectedMine = selected ? mine(selected) : undefined;

  const monthLabel = (() => {
    const a = parseDay(from);
    const b = parseDay(to);
    const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${a.toLocaleDateString(undefined, fmt)} – ${b.toLocaleDateString(
      undefined,
      { ...fmt, year: 'numeric' }
    )}`;
  })();

  return (
    <SectionCard
      title="When can you play?"
      description="Mark your days and the DM can see which nights the table can make."
      actions={
        <Button size="sm" variant="flat" onPress={() => setOpen(o => !o)}>
          {open ? 'Fold the calendar' : 'Open the calendar'}
        </Button>
      }
    >
      {!open ? (
        <Marginalia dash>
          click a day to say free, maybe, or busy — a blank day is a shrug
        </Marginalia>
      ) : !cal ? (
        <div className="flex justify-center py-6">
          <DiceSpinner label="Unrolling the calendar…" />
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Earlier"
                onPress={() => setStart(s => addDays(s, -7 * weeks))}
              >
                <Glyph name="chevron-left" size={14} />
              </Button>
              <span className="min-w-40 text-center text-sm text-ink">
                {monthLabel}
              </span>
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Later"
                onPress={() => setStart(s => addDays(s, 7 * weeks))}
              >
                <Glyph name="chevron-right" size={14} />
              </Button>
              <Button
                size="sm"
                variant="light"
                className="text-ink-muted"
                onPress={() => setStart(mondayOf(new Date()))}
              >
                This week
              </Button>
            </div>
            <div className="flex gap-1">
              {WEEK_CHOICES.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setWeeks(n)}
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    weeks === n
                      ? 'border-gold bg-gold/15 text-ink'
                      : 'border-line text-ink-muted hover:border-gold/60 hover:text-ink'
                  }`}
                >
                  {n === 1 ? '1 week' : `${n} weeks`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map(w => (
              <div
                key={w}
                className="pb-1 text-center font-display-alt text-[0.55rem] uppercase tracking-[0.16em] text-ink-subtle"
              >
                {w}
              </div>
            ))}
            {days.map(day => {
              const me = mine(day);
              const rows = byDay.get(day) ?? [];
              const free = rows.filter(r => r.status === 'yes').length;
              const maybe = rows.filter(r => r.status === 'maybe').length;
              const d = parseDay(day);
              const first = d.getDate() === 1 || day === from;
              const skin = me
                ? STATUS_SKIN[me.status]
                : 'border-line text-ink-muted hover:border-gold/60';
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => cycle(day)}
                  aria-label={`${d.toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}: ${me ? STATUS_LABEL[me.status] : 'not answered'}`}
                  className={`flex min-h-14 flex-col items-start rounded-md border px-1.5 py-1 text-left transition-colors ${skin} ${
                    selected === day ? 'ring-2 ring-gold/60' : ''
                  } ${day < today ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`text-xs tabular-nums ${
                      day === today ? 'font-semibold text-gold-strong' : ''
                    }`}
                  >
                    {first
                      ? d.toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                        })
                      : d.getDate()}
                  </span>
                  {(free > 0 || maybe > 0) && (
                    <span className="mt-auto text-[0.6rem] leading-tight text-ink-subtle">
                      {free > 0 && `${free} free`}
                      {free > 0 && maybe > 0 && ' · '}
                      {maybe > 0 && `${maybe} maybe`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="rounded-md border border-line bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm text-ink">
                  {parseDay(selected).toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>
                <div className="flex gap-1">
                  {(['yes', 'maybe', 'no'] as Availability[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        write(selected, selectedMine?.status === s ? null : s)
                      }
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        selectedMine?.status === s
                          ? STATUS_SKIN[s]
                          : 'border-line text-ink-muted hover:border-gold/60 hover:text-ink'
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                {selectedMine && (
                  <Input
                    size="sm"
                    aria-label="Hours"
                    placeholder="Hours — after 7, any time…"
                    value={note}
                    onValueChange={setNote}
                    onBlur={() => {
                      if (note.trim() !== (selectedMine.note ?? '')) {
                        write(selected, selectedMine.status, note.trim());
                      }
                    }}
                    className="max-w-56"
                  />
                )}
              </div>

              {seats.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {seats.map(seat => {
                    const row = selectedRows.find(
                      r => r.userId === seat.userId
                    );
                    return (
                      <li key={seat.userId} className="text-ink-muted">
                        <span className="text-ink">
                          {seat.name ?? 'Someone'}
                        </span>{' '}
                        {row ? (
                          <>
                            {STATUS_LABEL[row.status].toLowerCase()}
                            {row.note && (
                              <span className="text-ink-subtle">
                                {' '}
                                · {row.note}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-ink-subtle">not said</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <Marginalia dash>
            a blank day is a shrug, not a no — the DM can only count the days
            you have answered
          </Marginalia>
        </div>
      )}
    </SectionCard>
  );
}
