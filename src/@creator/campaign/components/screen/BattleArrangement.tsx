'use client';

import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Select,
  SelectItem,
} from '@heroui/react';
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
 * A phone held sideways: wide, and too short for a shelf beside anything.
 * The board takes the screen and the shelf becomes a sheet from the bottom.
 */
const LANDSCAPE_PHONE = '(orientation: landscape) and (max-height: 500px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/**
 * The sand table's arrangement: the board in front, a shelf beside it.
 *
 * Not columns of equal standing. A fight has one thing that matters — where
 * everybody is — and everything else is something you reach for: your hit
 * points, your weapons, the dice, whose turn it is. So the board fills the
 * main region and the shelf is a column of the panels the viewer chose,
 * each collapsible, the whole shelf collapsible to a strip of glyphs. On a
 * wide screen it can be two shelves, one each side, so the board keeps its
 * square rather than a letterbox.
 *
 * **Function over form.** The shelf renders its panels
 * headless through the same `.screen-box-body` flattening the boxes use, at
 * `text-sm`, with no card chrome. Density is the feature. On a phone the
 * shelf drops below the board rather than beside it; on a phone held
 * sideways it is a sheet the strip pulls up.
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
  const sideways = useMediaQuery(LANDSCAPE_PHONE);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Which panel is being dragged along the shelf, and where it would land.
  const [dragged, setDragged] = useState<ScreenPanelKey | null>(null);
  const [dropBefore, setDropBefore] = useState<ScreenPanelKey | 'end' | null>(
    null
  );

  const allowed = SCREEN_PANEL_KEYS.filter(
    k => (isStaff || SCREEN_PANELS[k].players) && k !== 'board'
  );
  const spare = allowed.filter(k => !layout.shelf.includes(k));
  const folded = new Set(layout.folded);

  // A fold is written into the layout, so it is still folded tomorrow. The
  // caller saves when the arrangement is done or, out of arrange mode, on
  // the next save — a fold that is lost is the thing this replaced.
  const setFolded = (key: ScreenPanelKey, isFolded: boolean) =>
    onChange({
      ...layout,
      folded: isFolded
        ? [...layout.folded.filter(k => k !== key), key]
        : layout.folded.filter(k => k !== key),
    });
  const toggleFold = (key: ScreenPanelKey) => setFolded(key, !folded.has(key));

  const move = (key: ScreenPanelKey, by: -1 | 1) => {
    const i = layout.shelf.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= layout.shelf.length) return;
    const shelf = [...layout.shelf];
    [shelf[i], shelf[j]] = [shelf[j], shelf[i]];
    onChange({ ...layout, shelf });
  };

  /** Put `key` in front of `before` (or at the end), the drag's landing. */
  const moveBefore = (key: ScreenPanelKey, before: ScreenPanelKey | 'end') => {
    if (key === before) return;
    const shelf = layout.shelf.filter(k => k !== key);
    const at = before === 'end' ? shelf.length : shelf.indexOf(before);
    shelf.splice(at < 0 ? shelf.length : at, 0, key);
    onChange({ ...layout, shelf });
  };

  const remove = (key: ScreenPanelKey) =>
    onChange({
      ...layout,
      shelf: layout.shelf.filter(k => k !== key),
      folded: layout.folded.filter(k => k !== key),
    });

  const add = (key: ScreenPanelKey) =>
    onChange({ ...layout, shelf: [...layout.shelf, key] });

  const open = layout.shelfOpen;
  // Two shelves: the odd panels take the left. Only on a wide screen — on
  // anything narrower `left` is empty and the right shelf holds them all.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1280px)');
    const update = () => setWide(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  const split = layout.shelfSide === 'both' && wide && open;
  const left = split ? layout.shelf.filter((_, i) => i % 2 === 1) : [];
  const right = split
    ? layout.shelf.filter((_, i) => i % 2 === 0)
    : layout.shelf;

  const panel = (key: ScreenPanelKey) => {
    const meta = SCREEN_PANELS[key];
    const isFolded = folded.has(key);
    return (
      <section
        key={key}
        aria-label={meta.label}
        onDragOver={event => {
          if (!dragged || !arranging) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropBefore(key);
        }}
        onDrop={event => {
          event.preventDefault();
          if (dragged) moveBefore(dragged, key);
          setDragged(null);
          setDropBefore(null);
        }}
        className={`border-b border-line last:border-b-0 ${
          dragged === key ? 'opacity-40' : ''
        } ${dragged && dropBefore === key ? 'border-t-2 border-t-gold' : ''}`}
      >
        <header
          draggable={arranging}
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', key);
            setDragged(key);
          }}
          onDragEnd={() => {
            setDragged(null);
            setDropBefore(null);
          }}
          className={`flex items-center gap-1.5 px-2 py-1 ${
            arranging ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          {arranging && (
            <Glyph
              name="compass"
              size={12}
              className="shrink-0 text-ink-subtle"
              label="Drag to move this panel"
            />
          )}
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
  };

  /** The column of panels, with a drop zone after the last one. */
  const column = (keys: ScreenPanelKey[]) => (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {keys.length === 0 && layout.shelf.length === 0 && (
        <p className="px-3 py-4 text-xs text-ink-subtle">
          Nothing on the shelf. Press Arrange to put something here.
        </p>
      )}
      {keys.map(panel)}
      {arranging && dragged && (
        <div
          onDragOver={event => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropBefore('end');
          }}
          onDrop={event => {
            event.preventDefault();
            if (dragged) moveBefore(dragged, 'end');
            setDragged(null);
            setDropBefore(null);
          }}
          className={`m-2 rounded border border-dashed border-line px-2 py-3 text-center text-xs text-ink-subtle ${
            dropBefore === 'end' ? 'border-gold bg-gold/[0.05]' : ''
          }`}
        >
          Drop it last
        </div>
      )}
    </div>
  );

  /** The glyph strip: each a way back in, worn with its count. */
  const strip = (onPick: (key: ScreenPanelKey) => void, row: boolean) => (
    <ul
      className={`flex gap-1 p-1 ${row ? 'flex-row' : 'flex-row lg:flex-col'}`}
    >
      {layout.shelf.map(key => (
        <li key={key}>
          <button
            type="button"
            onClick={() => onPick(key)}
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
  );

  const shelfHeader = (
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
      {open && arranging && (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...layout,
              shelfSide: layout.shelfSide === 'both' ? 'right' : 'both',
            })
          }
          className="ml-1 hidden rounded border border-line px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle hover:text-ink xl:inline-block"
          title="One shelf, or one each side of the board"
        >
          {layout.shelfSide === 'both' ? 'Both sides' : 'One side'}
        </button>
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
  );

  /* --- a phone held sideways ------------------------------------------- */

  if (sideways) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={regionRef}
          data-board-region
          className="screen-box-body min-h-0 flex-1 overflow-auto"
        >
          <div className="p-1">{board(regionHeight)}</div>
        </div>
        <div className="flex shrink-0 items-center border-t border-line bg-surface">
          {strip(key => {
            setFolded(key, false);
            setSheetOpen(true);
          }, true)}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="ml-auto px-3 py-1 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle hover:text-ink"
          >
            The shelf
          </button>
        </div>
        <Drawer
          isOpen={sheetOpen}
          onOpenChange={setSheetOpen}
          placement="bottom"
          size="lg"
          classNames={{ base: 'bg-surface', closeButton: 'text-ink-muted' }}
        >
          <DrawerContent>
            <DrawerHeader className="border-b border-line py-2 font-display-alt text-[0.65rem] uppercase tracking-[0.16em] text-ink-subtle">
              The shelf
            </DrawerHeader>
            <DrawerBody className="p-0">{column(layout.shelf)}</DrawerBody>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  /* --- everything else ------------------------------------------------- */

  const shelf = (keys: ScreenPanelKey[], side: 'left' | 'right') => (
    <aside
      aria-label={side === 'left' ? 'The left shelf' : 'The shelf'}
      className={`flex min-h-0 shrink-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface [box-shadow:var(--shadow-card)] transition-[width] max-lg:max-h-[45vh] ${
        open
          ? split
            ? 'lg:w-[18rem] xl:w-[20rem]'
            : 'lg:w-[22rem] xl:w-[26rem]'
          : 'lg:w-11'
      }`}
    >
      {side === 'right' ? (
        shelfHeader
      ) : (
        <header className="flex shrink-0 items-center gap-1 border-b border-line px-1.5 py-1">
          <span className="px-1 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
            The shelf
          </span>
        </header>
      )}
      {!open &&
        side === 'right' &&
        strip(key => {
          onChange({
            ...layout,
            shelfOpen: true,
            folded: layout.folded.filter(k => k !== key),
          });
        }, false)}
      {open && column(keys)}
    </aside>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
      {split && shelf(left, 'left')}

      {/* The board. It owns its own scroll; the page never does. */}
      <div
        ref={regionRef}
        data-board-region
        className="screen-box-body min-h-0 flex-1 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface [box-shadow:var(--shadow-card)]"
      >
        <div className="p-2">{board(regionHeight)}</div>
      </div>

      {shelf(right, 'right')}
    </div>
  );
}
