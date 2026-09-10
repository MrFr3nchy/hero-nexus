'use client';

import { Button, Input, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { Glyph, SectionCard } from '@/@shared/components/ui';
import type { LiveState, TimerRow } from '@/server/session';
import { startTimerAction, stopTimerAction } from '../../actions';

/**
 * Seconds left, or 0. Computed from the instant, never sent as a number —
 * a remaining-seconds count is stale before it arrives.
 */
function secondsLeft(endsAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * An hourglass with the sand at the level the countdown is at.
 *
 * The same drawing as `HourglassScene`, which was drawn for exactly this and
 * has been sitting in `ui/scenes.tsx` waiting: the upper chamber empties and
 * the lower fills as the fraction runs down. Still under
 * `prefers-reduced-motion` — the fill is a height, not an animation, so it
 * moves once a second either way and nothing bobs.
 */
function Hourglass({ fraction, spent }: { fraction: number; spent: boolean }) {
  const top = Math.max(0, Math.min(1, fraction));
  const tone = spent ? 'var(--danger)' : 'var(--gold)';
  return (
    <svg width="38" height="45" viewBox="0 0 76 90" aria-hidden="true">
      <path d="M16 8h44M16 82h44" stroke="var(--line)" strokeWidth="3.4" />
      <path
        d="M22 8v12c0 10 16 17 16 25s-16 15-16 25v12"
        fill="none"
        stroke="var(--line)"
        strokeWidth="1.6"
      />
      <path
        d="M54 8v12c0 10-16 17-16 25s16 15 16 25v12"
        fill="none"
        stroke="var(--line)"
        strokeWidth="1.6"
      />
      {/* Sand still to fall: a wedge in the upper chamber, shrinking. */}
      {top > 0 && (
        <path
          d="M24 10c0 9 14 15 14 15s14-6 14-15z"
          fill={tone}
          opacity="0.75"
          style={{
            transformOrigin: '38px 10px',
            transform: `scaleY(${top})`,
          }}
        />
      )}
      {/* Sand already fallen: the heap below, growing. */}
      {top < 1 && (
        <path
          d="M24 82c0-9 14-15 14-15s14 6 14 15z"
          fill={tone}
          opacity="0.75"
          style={{
            transformOrigin: '38px 82px',
            transform: `scaleY(${1 - top})`,
          }}
        />
      )}
    </svg>
  );
}

function OneTimer({
  timer,
  now,
  isStaff,
  campaignId,
  onChange,
}: {
  timer: TimerRow;
  now: number;
  isStaff: boolean;
  campaignId: string;
  onChange: () => void;
}) {
  const left = secondsLeft(timer.endsAt, now);
  const total = Math.max(
    1,
    Math.round(
      (new Date(timer.endsAt).getTime() - new Date(timer.startedAt).getTime()) /
        1000
    )
  );
  const spent = left === 0;

  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2">
      <Hourglass fraction={left / total} spent={spent} />
      <div className="min-w-0 flex-1">
        <div
          className={`font-display text-xl tabular-nums ${
            spent ? 'text-danger' : 'text-ink'
          }`}
        >
          {spent ? 'Time' : clock(left)}
        </div>
        <div className="truncate text-xs text-ink-muted">
          {timer.label || 'Counting down'}
        </div>
      </div>
      {timer.visibility === 'dm' && (
        <Tooltip content="Only staff can see this one.">
          <span>
            <Glyph name="candle" size={13} className="text-ink-subtle" />
          </span>
        </Tooltip>
      )}
      {isStaff && (
        <Button
          size="sm"
          variant="light"
          className="text-ink-subtle"
          onPress={async () => {
            await stopTimerAction(campaignId, timer.id);
            onChange();
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

/**
 * The table's countdowns.
 *
 * Expiry is a state, not an event: nothing fires when the sand runs out. The
 * glass says "Time", turns to danger, and stays until somebody clears it —
 * because a timer that vanishes at zero is a timer nobody saw finish.
 */
export function TimerPanel({
  campaignId,
  state,
  isStaff,
  refresh,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState('1');
  const [busy, setBusy] = useState(false);

  // One tick a second, locally. The live poll brings new timers; this only
  // moves the numbers already on screen.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = async (visibility: 'dm' | 'shared') => {
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) return;
    setBusy(true);
    await startTimerAction(campaignId, {
      label,
      seconds: Math.round(mins * 60),
      visibility,
    });
    setBusy(false);
    setLabel('');
    await refresh();
  };

  const timers = state.timers ?? [];

  return (
    <SectionCard
      title="The hourglass"
      description="What is running out, and how long is left of it."
    >
      {timers.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing is running out. {isStaff ? 'Start something below.' : ''}
        </p>
      ) : (
        <div className="space-y-2">
          {timers.map(t => (
            <OneTimer
              key={t.id}
              timer={t}
              now={now}
              isStaff={isStaff}
              campaignId={campaignId}
              onChange={refresh}
            />
          ))}
        </div>
      )}

      {isStaff && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <Input
            size="sm"
            label="What is running out"
            placeholder="The window to bring them back"
            value={label}
            onValueChange={setLabel}
            className="min-w-[13rem] flex-1"
          />
          <Input
            size="sm"
            type="number"
            label="Minutes"
            value={minutes}
            onValueChange={setMinutes}
            className="w-24"
          />
          <Button
            size="sm"
            variant="flat"
            isDisabled={busy}
            onPress={() => start('shared')}
          >
            Start it
          </Button>
          <Tooltip content="Runs behind the screen. The table sees nothing.">
            <Button
              size="sm"
              variant="light"
              className="text-ink-subtle"
              isDisabled={busy}
              onPress={() => start('dm')}
            >
              In secret
            </Button>
          </Tooltip>
        </div>
      )}
    </SectionCard>
  );
}
