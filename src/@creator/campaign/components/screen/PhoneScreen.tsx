'use client';

import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react';
import { useEffect, useState, type ReactNode } from 'react';

import { Glyph, Panel, type PanelStatus } from '@/@shared/components/ui';
import { SCREEN_PANELS, type ScreenPanelKey } from '../../lib/screen';

/** How many panels get their own button; the rest go under More. */
const ON_THE_BAR = 4;

const tabKey = (campaignId: string, state: string) =>
  `hero-nexus.screen-tab.${campaignId}.${state}`;

function readTab(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTab(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage refused: the screen opens on its first panel next time.
  }
}

/**
 * The session screen on a phone: one panel at a time, with a bar of panels
 * along the bottom.
 *
 * Below `lg` the columns used to stack into one long page, and a player at
 * the table scrolled past the order and the dice to reach their own hero
 * every turn. Now the screen shows the panel they picked, filling the body,
 * and the bar carries the first four panels of the arrangement — badges and
 * all — with the rest under More. The phone follows the arrangement rather
 * than having its own: arranging is a desk act, and one arrangement is one
 * thing to keep right.
 *
 * Which panel was showing is remembered per screen state on this device, so
 * the fight opens on the board and the table on your hero.
 */
export function PhoneScreen({
  campaignId,
  state,
  panels,
  render,
  titleOf,
  wear,
}: {
  campaignId: string;
  /** Which screen state this is ("table", "battle"), for the remembered tab. */
  state: string;
  /** The arrangement's panels in reading order; the board first in a fight. */
  panels: ScreenPanelKey[];
  render: (key: ScreenPanelKey) => ReactNode;
  titleOf: (key: ScreenPanelKey) => string;
  wear: (key: ScreenPanelKey) => {
    status: PanelStatus;
    detail?: ReactNode;
    badge?: number;
  };
}) {
  const storage = tabKey(campaignId, state);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(readTab(storage)), [storage]);

  if (panels.length === 0) {
    return (
      <p className="m-auto p-6 text-center text-sm text-ink-muted">
        Nothing is arranged on this screen. Arrange it on a bigger one.
      </p>
    );
  }

  const shown: ScreenPanelKey = panels.includes(picked as ScreenPanelKey)
    ? (picked as ScreenPanelKey)
    : panels[0];
  const pick = (key: ScreenPanelKey) => {
    setPicked(key);
    writeTab(storage, key);
  };

  const bar = panels.slice(0, ON_THE_BAR);
  const more = panels.slice(ON_THE_BAR);
  // A panel picked from More takes the last place on the bar while it shows,
  // so the reader can always see which one they are looking at.
  if (more.includes(shown)) bar[bar.length - 1] = shown;
  const rest = panels.filter(k => !bar.includes(k));
  const restBadge = rest.reduce((n, k) => n + (wear(k).badge ?? 0), 0);

  const w = wear(shown);
  const isBoard = shown === 'board';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 p-2">
        <Panel
          title={titleOf(shown)}
          status={w.status}
          statusDetail={w.detail}
          badge={w.badge}
          scroll={!isBoard}
          padded={!isBoard}
          className="min-h-0 flex-1"
        >
          {render(shown)}
        </Panel>
      </div>

      <nav
        aria-label="Panels"
        className="flex shrink-0 items-stretch justify-around border-t border-line bg-surface px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
      >
        {bar.map(key => {
          const badge = wear(key).badge;
          const on = key === shown;
          return (
            <button
              key={key}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => pick(key)}
              className={`relative flex min-h-11 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[0.68rem] ${
                on ? 'font-semibold text-ink' : 'text-ink-muted'
              }`}
            >
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-4 -top-1 h-[3px] rounded-b bg-gold"
                />
              )}
              <Glyph name={SCREEN_PANELS[key].glyph} size={18} />
              <span className="max-w-full truncate">
                {SCREEN_PANELS[key].label}
              </span>
              {!!badge && (
                <span className="absolute right-2 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-semibold text-bg">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        {rest.length > 0 && (
          <Dropdown placement="top-end">
            <DropdownTrigger>
              <button
                type="button"
                className="relative flex min-h-11 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[0.68rem] text-ink-muted"
              >
                <Glyph name="chevron-up" size={18} />
                <span>More</span>
                {restBadge > 0 && (
                  <span className="absolute right-2 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-semibold text-bg">
                    {restBadge}
                  </span>
                )}
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="More panels"
              onAction={key => pick(String(key) as ScreenPanelKey)}
            >
              {rest.map(key => (
                <DropdownItem
                  key={key}
                  textValue={SCREEN_PANELS[key].label}
                  startContent={
                    <Glyph name={SCREEN_PANELS[key].glyph} size={15} />
                  }
                  endContent={
                    wear(key).badge ? (
                      <span className="text-xs font-semibold text-danger">
                        {wear(key).badge}
                      </span>
                    ) : null
                  }
                >
                  {SCREEN_PANELS[key].label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        )}
      </nav>
    </div>
  );
}
