'use client';

import { Button, Input } from '@heroui/react';
import { useEffect, useState } from 'react';

import { ControlRow, Glyph, Marginalia, Pill } from '@/@shared/components/ui';
import { formatCalendarDate } from '@/@shared/lib/dates';
import type { PollOptionRow, PollRow, PollVote } from '@/server/scheduling';
import {
  listAvailabilityAction,
  openPollAction,
  settlePollAction,
  votePollAction,
  withdrawPollAction,
} from '../scheduling-actions';
import { dayKey } from './AvailabilityPanel';

/*
 * Putting a night to the table.
 *
 * The DM holds up a few candidate dates for one planned sitting; everybody
 * answers each one; the DM settles on one and the sitting takes that date.
 * The builder reads the availability grid to suggest the days most of the
 * table said they were free — a suggestion, never a decision.
 */

const VOTE: { key: PollVote; label: string }[] = [
  { key: 'yes', label: 'In' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'no', label: 'Out' },
];

export function formatSlot(day: string, time: string): string {
  const date = formatCalendarDate(day, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  if (!time) return date;
  const clock = new Date(`${day}T${time}`).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} · ${clock}`;
}

type Result = { ok: boolean; error?: string };

/* --- the builder ------------------------------------------------------- */

interface Candidate {
  day: string;
  time: string;
}

function PollBuilder({
  campaignId,
  sessionId,
  onDone,
  onCancel,
  onError,
}: {
  campaignId: string;
  sessionId: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [suggested, setSuggested] = useState<
    { day: string; free: number; maybe: number }[] | null
  >(null);
  const [opening, setOpening] = useState(false);

  // The next eight weeks of the calendar, ranked by how many said free.
  useEffect(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 8 * 7);
    listAvailabilityAction(campaignId, dayKey(today), dayKey(end)).then(res => {
      if (!res.ok) {
        setSuggested([]);
        return;
      }
      const tally = new Map<string, { free: number; maybe: number }>();
      for (const row of res.data.rows) {
        const t = tally.get(row.day) ?? { free: 0, maybe: 0 };
        if (row.status === 'yes') t.free += 1;
        if (row.status === 'maybe') t.maybe += 1;
        tally.set(row.day, t);
      }
      setSuggested(
        [...tally.entries()]
          .map(([d, t]) => ({ day: d, ...t }))
          .filter(t => t.free > 0)
          .sort(
            (a, b) =>
              b.free - a.free || b.maybe - a.maybe || a.day.localeCompare(b.day)
          )
          .slice(0, 6)
      );
    });
  }, [campaignId]);

  const add = (c: Candidate) => {
    if (!c.day) return;
    setCandidates(prev =>
      prev.some(p => p.day === c.day && p.time === c.time)
        ? prev
        : [...prev, c].sort(
            (a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time)
          )
    );
  };

  const open = async () => {
    setOpening(true);
    const res = await openPollAction(campaignId, sessionId, candidates);
    setOpening(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    await onDone();
  };

  return (
    <div className="space-y-3">
      {suggested && suggested.length > 0 && (
        <div>
          <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
            From the calendar
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {suggested.map(s => (
              <button
                key={s.day}
                type="button"
                onClick={() => add({ day: s.day, time: '' })}
                className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted transition-colors hover:border-gold/60 hover:text-ink"
              >
                {formatSlot(s.day, '')}
                <span className="text-ink-subtle">
                  {' '}
                  · {s.free} free{s.maybe > 0 ? `, ${s.maybe} maybe` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ControlRow size="sm">
        <Input
          size="sm"
          type="date"
          label="Day"
          value={day}
          onValueChange={setDay}
          className="sm:w-44"
        />
        <Input
          size="sm"
          type="time"
          label="From"
          value={time}
          onValueChange={setTime}
          className="sm:w-32"
        />
        <Button
          size="sm"
          variant="flat"
          onPress={() => {
            add({ day, time });
            setDay('');
          }}
        >
          Add a night
        </Button>
      </ControlRow>

      {candidates.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {candidates.map(c => (
            <li key={`${c.day}-${c.time}`}>
              <button
                type="button"
                onClick={() =>
                  setCandidates(prev =>
                    prev.filter(p => !(p.day === c.day && p.time === c.time))
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border border-gold bg-gold/15 px-2 py-1 text-xs text-ink transition-colors hover:border-danger/60"
                aria-label={`Remove ${formatSlot(c.day, c.time)}`}
              >
                {formatSlot(c.day, c.time)}
                <Glyph name="x" size={10} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Marginalia dash>
          pick a few nights and the table will pick one
        </Marginalia>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          color="primary"
          isLoading={opening}
          isDisabled={candidates.length === 0}
          onPress={open}
        >
          Put it to the table
        </Button>
        <Button
          size="sm"
          variant="light"
          className="text-ink-muted"
          onPress={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* --- one option ---------------------------------------------------------- */

function OptionRow({
  campaignId,
  pollId,
  option,
  isStaff,
  open,
  chosen,
  act,
}: {
  campaignId: string;
  pollId: string;
  option: PollOptionRow;
  isStaff: boolean;
  open: boolean;
  chosen: boolean;
  act: (p: Promise<Result>) => Promise<void>;
}) {
  const yes = option.votes.filter(v => v.vote === 'yes');
  const maybe = option.votes.filter(v => v.vote === 'maybe');
  const no = option.votes.filter(v => v.vote === 'no');
  return (
    <li
      className={`rounded-md border px-3 py-2 ${
        chosen ? 'border-gold/60 bg-gold/[0.06]' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 text-sm text-ink">
          {formatSlot(option.day, option.time)}
          {chosen && (
            <span className="ml-2">
              <Pill tone="gold">Settled</Pill>
            </span>
          )}
        </span>
        <span className="text-xs tabular-nums text-ink-subtle">
          {yes.length} in, {maybe.length} maybe, {no.length} out
        </span>
        {open && (
          <div className="flex gap-1">
            {VOTE.map(v => (
              <button
                key={v.key}
                type="button"
                onClick={() =>
                  act(
                    votePollAction(
                      option.id,
                      option.mine === v.key ? null : v.key
                    )
                  )
                }
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  option.mine === v.key
                    ? 'border-gold bg-gold/15 text-ink'
                    : 'border-line text-ink-muted hover:border-gold/60 hover:text-ink'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        {open && isStaff && (
          <Button
            size="sm"
            variant="flat"
            color="primary"
            onPress={() => act(settlePollAction(campaignId, pollId, option.id))}
          >
            Settle here
          </Button>
        )}
      </div>
      {yes.length > 0 && (
        <p className="mt-1 text-xs text-ink-subtle">
          In: {yes.map(v => v.name ?? 'Someone').join(', ')}
          {maybe.length > 0 &&
            ` · Maybe: ${maybe.map(v => v.name ?? 'Someone').join(', ')}`}
        </p>
      )}
    </li>
  );
}

/* --- the block on a sitting ------------------------------------------- */

export function SessionPoll({
  campaignId,
  sessionId,
  polls,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  sessionId: string;
  /** Every poll ever held for this sitting, oldest first. */
  polls: PollRow[];
  isStaff: boolean;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [building, setBuilding] = useState(false);
  const open = polls.find(p => p.status === 'open') ?? null;
  const settled =
    [...polls].reverse().find(p => p.status === 'settled') ?? null;

  const act = async (p: Promise<Result>) => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  if (building) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <p className="mb-2 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
          Which night?
        </p>
        <PollBuilder
          campaignId={campaignId}
          sessionId={sessionId}
          onDone={async () => {
            setBuilding(false);
            await refresh();
          }}
          onCancel={() => setBuilding(false)}
          onError={onError}
        />
      </div>
    );
  }

  if (open) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
            Which night?
          </span>
          <Pill tone="gold">Vote open</Pill>
          {isStaff && (
            <Button
              size="sm"
              variant="light"
              className="ml-auto text-ink-muted"
              onPress={() => act(withdrawPollAction(campaignId, open.id))}
            >
              Take it down
            </Button>
          )}
        </div>
        <ul className="mt-2 space-y-1.5">
          {open.options.map(o => (
            <OptionRow
              key={o.id}
              campaignId={campaignId}
              pollId={open.id}
              option={o}
              isStaff={isStaff}
              open
              chosen={false}
              act={act}
            />
          ))}
        </ul>
      </div>
    );
  }

  const chosen = settled?.options.find(o => o.id === settled.chosenOptionId);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
      {chosen ? (
        <p className="text-xs text-ink-subtle">
          Settled by vote: {formatSlot(chosen.day, chosen.time)} ·{' '}
          {chosen.votes.filter(v => v.vote === 'yes').length} in
        </p>
      ) : (
        isStaff && (
          <Marginalia dash>
            or hold up a few nights and let the table pick
          </Marginalia>
        )
      )}
      {isStaff && (
        <Button
          size="sm"
          variant="flat"
          className="ml-auto"
          onPress={() => setBuilding(true)}
        >
          {chosen ? 'Vote again' : 'Put the date to a vote'}
        </Button>
      )}
    </div>
  );
}
