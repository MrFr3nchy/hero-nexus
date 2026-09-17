'use client';

import { Button, Switch, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { Glyph, Marginalia, SectionCard } from '@/@shared/components/ui';
import { useTable } from '@/@shared/table';
import { TABLE_EVENT_KINDS, type EventTone } from '@/@shared/table';

const TONE_INK: Record<EventTone, string> = {
  gold: 'text-gold-strong dark:text-gold',
  danger: 'text-danger',
  success: 'text-success',
  arcane: 'text-arcane',
};

function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** How each kind reads in the volume control. Two words, in the table's voice. */
const KIND_LABEL: Record<(typeof TABLE_EVENT_KINDS)[number], string> = {
  roll: 'Dice',
  turn: 'Turns',
  encounter: 'Fights',
  timer: 'Countdowns',
  handout: 'Handouts',
  reveal: 'Reveals',
  check: 'Asks',
  sitting: 'The table',
  vitals: 'Hit points',
  map: 'Maps',
  whisper: 'Whispers',
  gift: 'Gifts',
  thing: 'Doors and chests',
  rules: 'Rulings',
  effect: 'Conditions and countdowns',
  action: 'Actions',
  opportunity: 'Opportunity attacks',
  cast: 'Spells',
  time: 'The clock',
  rest: 'Rests',
  levelup: 'Levels',
  undo: 'Undo',
  ambience: 'Music',
};

/**
 * The browser's permission for notifications, asked for on a press. False
 * when the browser has none to give, or the reader said no — then the
 * preference stays where it was, because a notification that cannot fire
 * is not a preference worth recording.
 */
async function askNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/**
 * The evening's traffic, standing still.
 *
 * The same moments the corner announces, kept as a list — for a DM who wants
 * the session's noise in a box they can look down at rather than as slips that
 * pass while they are talking. One `describe` feeds both, so the panel and the
 * announcement never say different things about the same event.
 *
 * It empties when the tab closes, and that is honest: an event is a moment,
 * and the things that outlive one are rows elsewhere — the roll log, the
 * reveal timeline, the checks. This is not a second copy of any of them.
 *
 * It also carries the volume control, because this is the panel somebody
 * already opens when the corner is too busy. The settings are **per reader,
 * per device** — a DM running a fight and a player with the tab open on a
 * second monitor want different answers, and a campaign-wide setting would
 * make one of them wrong.
 */

export function FeedPanel({ campaignId }: { campaignId: string }) {
  const { history, announcements, dismissAll, preferences, setPreferences } =
    useTable();
  const [tuning, setTuning] = useState(false);
  const mine = history.filter(a => a.campaignId === campaignId);

  return (
    <SectionCard
      title="The evening"
      description="Everything the table has been told, since you opened this tab."
      actions={
        <>
          {announcements.length > 0 && (
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={dismissAll}
            >
              Clear the corner
            </Button>
          )}
          <Button
            size="sm"
            variant={tuning ? 'flat' : 'light'}
            className="text-ink-muted"
            onPress={() => setTuning(t => !t)}
          >
            {tuning ? 'Done' : 'Turn it down'}
          </Button>
        </>
      }
    >
      {tuning && (
        <div className="mb-3 space-y-2 rounded-md border border-line bg-surface-2 px-3 py-2.5">
          <p className="text-xs text-ink-muted">
            What raises a slip in the corner. Everything still lands here.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {TABLE_EVENT_KINDS.map(kind => (
              <Switch
                key={kind}
                size="sm"
                isSelected={preferences.announce[kind]}
                onValueChange={on =>
                  setPreferences({
                    ...preferences,
                    announce: { ...preferences.announce, [kind]: on },
                  })
                }
              >
                <span className="text-xs text-ink-muted">
                  {KIND_LABEL[kind]}
                </span>
              </Switch>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-2">
            <Tooltip content="One short tone. Off unless you ask for it. Something aimed at you rings three notes.">
              <div className="inline-block">
                <Switch
                  size="sm"
                  isSelected={preferences.sound}
                  onValueChange={sound =>
                    setPreferences({ ...preferences, sound })
                  }
                >
                  <span className="text-xs text-ink-muted">Make a sound</span>
                </Switch>
              </div>
            </Tooltip>
            {/* Reaching you on another tab (12): the browser's own
                notification, asked for here on a press and never on load. */}
            <div className="inline-flex items-center gap-1.5">
              <span className="text-xs text-ink-muted">
                When this tab is hidden
              </span>
              <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
                {(
                  [
                    ['off', 'nothing'],
                    ['addressed', 'aimed at me'],
                    ['all', 'everything'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={async () => {
                      if (value !== 'off') {
                        const ok = await askNotificationPermission();
                        if (!ok) return;
                      }
                      setPreferences({ ...preferences, notify: value });
                    }}
                    className={`rounded px-1.5 py-0.5 text-[0.65rem] ${
                      preferences.notify === value
                        ? 'bg-gold font-medium text-bg'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Marginalia dash>
            a question always gets through, muted or not
          </Marginalia>
        </div>
      )}
      {mine.length === 0 ? (
        <Marginalia dash>nothing has happened yet</Marginalia>
      ) : (
        <ol className="divide-y divide-line">
          {mine.map(a => (
            <li key={a.id} className="flex items-baseline gap-2.5 py-2">
              <Glyph
                name={a.reading.glyph}
                size={14}
                className={`shrink-0 translate-y-0.5 ${TONE_INK[a.reading.tone]}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink">
                  {a.reading.title}
                </p>
                {a.reading.detail && (
                  <p className="truncate text-xs text-ink-subtle">
                    {a.reading.detail}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[0.65rem] tabular-nums text-ink-subtle">
                {clock(a.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
