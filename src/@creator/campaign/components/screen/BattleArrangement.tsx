'use client';

import { Select, SelectItem } from '@heroui/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Glyph } from '@/@shared/components/ui';
import {
  SCREEN_PANELS,
  SCREEN_PANEL_KEYS,
  type BattleLayout,
  type ScreenPanelKey,
} from '../../lib/screen';

/** A count worn on a glyph. Only ever drawn when it is above zero. */
function Badge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} waiting`}
      className="absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full bg-gold px-1 text-center text-[0.6rem] font-medium leading-4 tabular-nums text-bg"
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

/**
 * The sand table's arrangement: the board in front, a shelf beside it.
 *
 * Not columns of equal standing. A fight has one thing that matters — where
 * everybody is — and everything else is something you reach for: your hit
 * points, your weapons, the dice, whose turn it is. So the board fills the
 * main region and the shelf is a column of the panels the viewer chose,
 * each collapsible, the whole shelf collapsible to a strip of glyphs.
 *
 * **Function over form.** The shelf renders its panels
 * headless through the same `.screen-box-body` flattening the boxes use, at
 * `text-sm`, with no card chrome. Density is the feature. On a phone the
 * shelf drops below the board rather than beside it.
 */
export function BattleArrangement({
  layout,
  arranging,
  isStaff,
  badges = {},
  onChange,
  board,
  renderPanel,
}: {
  layout: BattleLayout;
  arranging: boolean;
  isStaff: boolean;
  /**
   * Counts to wear on the strip and on a folded panel's header: an ask
   * waiting on the viewer, a whisper unread. Nothing else earns one.
   */
  badges?: Partial<Record<ScreenPanelKey, number>>;
  onChange: (next: BattleLayout) => void;
  board: (fitHeight: number) => ReactNode;
  renderPanel: (key: ScreenPanelKey) => ReactNode;
}) {
  // The main region's height, so the board can fit it rather than overflow
  // it. Measured, and re-measured when the window or the shelf changes.
  const regionRef = useRef<HTMLDivElement>(null);
  const [regionHeight, setRegionHeight] = useState(0);
  useEffect(() => {
    const el = regionRef.current;
    if (!el) return;
    const measure = () => setRegionHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Which shelf panels are folded, per tab. A fold is a glance away, not a
  // preference worth a round trip.
  const [folded, setFolded] = useState<Set<ScreenPanelKey>>(new Set());
  const allowed = SCREEN_PANEL_KEYS.filter(
    k => (isStaff || SCREEN_PANELS[k].players) && k !== 'board'
  );
  const spare = allowed.filter(k => !layout.shelf.includes(k));

  const toggleFold = (key: ScreenPanelKey) =>
    setFolded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const move = (key: ScreenPanelKey, by: -1 | 1) => {
    const i = layout.shelf.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= layout.shelf.length) return;
    const shelf = [...layout.shelf];
    [shelf[i], shelf[j]] = [shelf[j], shelf[i]];
    onChange({ ...layout, shelf });
  };

  const remove = (key: ScreenPanelKey) =>
    onChange({ ...layout, shelf: layout.shelf.filter(k => k !== key) });

  const add = (key: ScreenPanelKey) =>
    onChange({ ...layout, shelf: [...layout.shelf, key] });

  const open = layout.shelfOpen;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
      {/* The board. It owns its own scroll; the page never does. */}
      <div
        ref={regionRef}
        data-board-region
        className="screen-box-body min-h-0 flex-1 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface [box-shadow:var(--shadow-card)]"
      >
        <div className="p-2">{board(regionHeight)}</div>
      </div>

      {/* The shelf. */}
      <aside
        aria-label="The shelf"
        className={`flex min-h-0 shrink-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface [box-shadow:var(--shadow-card)] transition-[width] max-lg:max-h-[45vh] ${
          open ? 'lg:w-[22rem] xl:w-[26rem]' : 'lg:w-11'
        }`}
      >
        <header className="flex shrink-0 items-center gap-1 border-b border-line px-1.5 py-1">
          <button
            type="button"
            onClick={() => onChange({ ...layout, shelfOpen: !open })}
            className="rounded p-1 text-ink-muted hover:text-ink"
            aria-label={open ? 'Fold the shelf away' : 'Open the shelf'}
            title={open ? 'Fold the shelf away' : 'Open the shelf'}
          >
            <Glyph name={open ? 'x' : 'plus'} size={13} />
          </button>
          {open && (
            <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
              The shelf
            </span>
          )}
          {open && arranging && spare.length > 0 && (
            <Select
              aria-label="Add to the shelf"
              size="sm"
              className="ml-auto w-36"
              classNames={{ trigger: 'h-7 min-h-7' }}
              placeholder="Add"
              selectedKeys={[]}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                if (key) add(String(key) as ScreenPanelKey);
              }}
            >
              {spare.map(key => (
                <SelectItem key={key} textValue={SCREEN_PANELS[key].label}>
                  {SCREEN_PANELS[key].label}
                </SelectItem>
              ))}
            </Select>
          )}
        </header>

        {/* Folded away: a strip of glyphs, each a way back in. */}
        {!open && (
          <ul className="flex flex-row gap-1 p-1 lg:flex-col">
            {layout.shelf.map(key => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...layout, shelfOpen: true });
                    setFolded(prev => {
                      const next = new Set(prev);
                      next.delete(key);
                      return next;
                    });
                  }}
                  title={SCREEN_PANELS[key].label}
                  aria-label={`Open ${SCREEN_PANELS[key].label}`}
                  className="relative rounded p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  <Glyph name={SCREEN_PANELS[key].glyph} size={15} />
                  <Badge count={badges[key]} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {layout.shelf.length === 0 && (
              <p className="px-3 py-4 text-xs text-ink-subtle">
                Nothing on the shelf. Press Arrange to put something here.
              </p>
            )}
            {layout.shelf.map(key => {
              const meta = SCREEN_PANELS[key];
              const isFolded = folded.has(key);
              return (
                <section
                  key={key}
                  aria-label={meta.label}
                  className="border-b border-line last:border-b-0"
                >
                  <header className="flex items-center gap-1.5 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => toggleFold(key)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-ink-muted hover:text-ink"
                      aria-expanded={!isFolded}
                    >
                      <Glyph name={meta.glyph} size={13} className="shrink-0" />
                      <span className="truncate font-display-alt text-[0.6rem] uppercase tracking-[0.14em]">
                        {meta.label}
                      </span>
                      {/* A folded panel with something waiting says so; an
                          open one is showing it already. */}
                      {isFolded && !!badges[key] && (
                        <span className="rounded-full bg-gold px-1.5 text-[0.6rem] font-medium tabular-nums text-bg">
                          {badges[key]}
                        </span>
                      )}
                    </button>
                    {arranging && (
                      <span className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={() => move(key, -1)}
                          className="px-1 text-[0.65rem] text-ink-subtle hover:text-ink"
                          aria-label="Move up"
                        >
                          <Glyph name="chevron-up" size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(key, 1)}
                          className="px-1 text-[0.65rem] text-ink-subtle hover:text-ink"
                          aria-label="Move down"
                        >
                          <Glyph name="chevron-down" size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(key)}
                          className="px-1 text-ink-subtle hover:text-danger"
                          aria-label="Take off the shelf"
                        >
                          <Glyph name="x" size={11} />
                        </button>
                      </span>
                    )}
                  </header>
                  {!isFolded && (
                    <div className="screen-box-body shelf-dense px-2 pb-2">
                      {renderPanel(key)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
