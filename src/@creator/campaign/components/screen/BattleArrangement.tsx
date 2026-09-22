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

import { Glyph, Panel, type PanelStatus } from '@/@shared/components/ui';
import {
  SCREEN_PANELS,
  SCREEN_PANEL_KEYS,
  panelsAround,
  type BattleLayout,
  type ScreenPanelKey,
} from '../../lib/screen';

/** What a panel wears beside the board: the same answer the box grid gives. */
export interface PanelWear {
  status: PanelStatus;
  detail?: ReactNode;
  badge?: number;
}

/** Which of the three regions a panel sits in. */
type Region = 'left' | 'right' | 'rail';
const REGIONS: readonly Region[] = ['left', 'right', 'rail'];
const REGION_LABEL: Record<Region, string> = {
  left: 'Left of the board',
  right: 'Right of the board',
  rail: 'Under the board',
};

/** A count worn on a glyph in the strip. Only ever drawn above zero. */
function Badge({
  count,
  waiting,
}: {
  count: number | undefined;
  waiting: boolean;
}) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} waiting`}
      className={`absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full px-1 text-center text-[0.6rem] font-bold leading-4 tabular-nums text-bg ${
        waiting ? 'bg-danger' : 'bg-warning'
      }`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

/**
 * A phone held sideways: wide, and too short for panels beside anything.
 * The board takes the screen and the panels become a sheet from the bottom.
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
 * The fight's arrangement: the battle board in the middle, panels around it.
 *
 * Not columns of equal standing. A fight has one thing that matters — where
 * everybody is — and everything else is something you reach for: your hit
 * points, your weapons, the dice, whose turn it is. So the board takes the
 * middle and the panels flank it on the left and the right, with a rail
 * under it for the short wide ones. One column beside the board was never
 * enough for a DM: the order, the stat block, the dice and the party do not
 * fit in a stack you have to scroll mid-round.
 *
 * **Function over form.** Every panel renders in the same `Panel` chrome the
 * boxes use, at panel density — tighter, `text-sm` — and the board sits in
 * one too, so the whole screen is one thing. Density is the feature. On a
 * phone the panels drop below the board rather than beside it; on a phone
 * held sideways they become a sheet the strip pulls up.
 */
export function BattleArrangement({
  layout,
  arranging,
  isStaff,
  badges = {},
  wear,
  titleOf,
  onChange,
  board,
  renderPanel,
}: {
  layout: BattleLayout;
  arranging: boolean;
  isStaff: boolean;
  /**
   * Counts to wear on the strip and on a folded panel's header: a check
   * waiting on the viewer, a whisper unread. Nothing else earns one.
   */
  badges?: Partial<Record<ScreenPanelKey, number>>;
  /** The state each panel is in, from the status language. */
  wear: (key: ScreenPanelKey) => PanelWear;
  /** The title each panel wears, with whatever follows it. */
  titleOf: (key: ScreenPanelKey) => string;
  onChange: (next: BattleLayout) => void;
  board: (fitHeight: number) => ReactNode;
  renderPanel: (key: ScreenPanelKey) => ReactNode;
}) {
  // The board region's height, so the board can fit it rather than overflow
  // it. Measured, and re-measured when the window or the panels change.
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
  // Which panel is being dragged, and where it would land.
  const [dragged, setDragged] = useState<ScreenPanelKey | null>(null);
  const [dropAt, setDropAt] = useState<{
    region: Region;
    before: ScreenPanelKey | 'end';
  } | null>(null);

  const all = panelsAround(layout);
  const allowed = SCREEN_PANEL_KEYS.filter(
    k => (isStaff || SCREEN_PANELS[k].players) && k !== 'board'
  );
  const spare = allowed.filter(k => !all.includes(k));
  const folded = new Set(layout.folded);
  const open = layout.open;

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

  const regionOf = (key: ScreenPanelKey): Region =>
    layout.left.includes(key)
      ? 'left'
      : layout.rail.includes(key)
        ? 'rail'
        : 'right';

  /** Put `key` into `region`, in front of `before` (or at its end). */
  const place = (
    key: ScreenPanelKey,
    region: Region,
    before: ScreenPanelKey | 'end'
  ) => {
    const without = {
      left: layout.left.filter(k => k !== key),
      right: layout.right.filter(k => k !== key),
      rail: layout.rail.filter(k => k !== key),
    };
    const target = [...without[region]];
    const at = before === 'end' ? target.length : target.indexOf(before);
    target.splice(at < 0 ? target.length : at, 0, key);
    onChange({ ...layout, ...without, [region]: target });
  };

  const move = (key: ScreenPanelKey, by: -1 | 1) => {
    const region = regionOf(key);
    const list = [...layout[region]];
    const i = list.indexOf(key);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange({ ...layout, [region]: list });
  };

  const remove = (key: ScreenPanelKey) =>
    onChange({
      ...layout,
      left: layout.left.filter(k => k !== key),
      right: layout.right.filter(k => k !== key),
      rail: layout.rail.filter(k => k !== key),
      folded: layout.folded.filter(k => k !== key),
    });

  const add = (key: ScreenPanelKey, region: Region) =>
    onChange({ ...layout, [region]: [...layout[region], key] });

  const panel = (key: ScreenPanelKey, region: Region) => {
    const meta = SCREEN_PANELS[key];
    const isFolded = folded.has(key);
    const w = wear(key);
    const over = dragged && dropAt?.region === region && dropAt.before === key;
    return (
      <div
        key={key}
        onDragOver={event => {
          if (!dragged || !arranging) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropAt({ region, before: key });
        }}
        onDrop={event => {
          event.preventDefault();
          if (dragged) place(dragged, region, key);
          setDragged(null);
          setDropAt(null);
        }}
        className={`${region === 'rail' ? 'min-w-64 flex-1 p-1' : 'px-1.5 pt-1.5'} ${
          over ? 'border-t-2 border-t-gold' : ''
        }`}
      >
        <Panel
          title={titleOf(key)}
          label={meta.label}
          status={w.status}
          statusDetail={w.detail}
          badge={w.badge}
          density="shelf"
          folded={isFolded}
          onFold={next => setFolded(key, next)}
          arranging={arranging}
          dragging={dragged === key}
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', key);
            setDragged(key);
          }}
          onDragEnd={() => {
            setDragged(null);
            setDropAt(null);
          }}
          onRemove={() => remove(key)}
          arrangeControls={
            <span className="flex shrink-0 items-center gap-0.5">
              <Select
                aria-label={`Which side ${meta.label} sits on`}
                size="sm"
                variant="flat"
                className="w-28"
                classNames={{ trigger: 'h-6 min-h-6' }}
                selectedKeys={[region]}
                onSelectionChange={keys => {
                  const next = Array.from(keys)[0];
                  if (next && next !== region) {
                    place(key, String(next) as Region, 'end');
                  }
                }}
              >
                {REGIONS.map(r => (
                  <SelectItem key={r} textValue={REGION_LABEL[r]}>
                    {REGION_LABEL[r]}
                  </SelectItem>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => move(key, -1)}
                className="px-1 text-ink-subtle hover:text-ink"
                aria-label="Move up"
              >
                <Glyph name="chevron-up" size={11} />
              </button>
              <button
                type="button"
                onClick={() => move(key, 1)}
                className="px-1 text-ink-subtle hover:text-ink"
                aria-label="Move down"
              >
                <Glyph name="chevron-down" size={11} />
              </button>
            </span>
          }
          // A flank scrolls as a column; a panel on it grows to its content
          // rather than scrolling inside a scroller.
          className={region === 'rail' ? 'max-h-[30vh]' : 'max-h-[60vh]'}
        >
          {renderPanel(key)}
        </Panel>
      </div>
    );
  };

  /** A drop zone at the end of a region, so a panel can land last. */
  const dropLast = (region: Region) =>
    arranging && dragged ? (
      <div
        onDragOver={event => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropAt({ region, before: 'end' });
        }}
        onDrop={event => {
          event.preventDefault();
          if (dragged) place(dragged, region, 'end');
          setDragged(null);
          setDropAt(null);
        }}
        className={`m-2 min-w-40 flex-1 rounded border border-dashed border-line px-2 py-3 text-center text-xs text-ink-subtle ${
          dropAt?.region === region && dropAt.before === 'end'
            ? 'border-gold bg-gold/[0.05]'
            : ''
        }`}
      >
        {REGION_LABEL[region]}
      </div>
    ) : null;

  /** The glyph strip: each a way back in, worn with its count. */
  const strip = (onPick: (key: ScreenPanelKey) => void, row: boolean) => (
    <ul
      className={`flex gap-1 p-1 ${row ? 'flex-row' : 'flex-row lg:flex-col'}`}
    >
      {all.map(key => (
        <li key={key}>
          <button
            type="button"
            onClick={() => onPick(key)}
            title={SCREEN_PANELS[key].label}
            aria-label={`Open ${SCREEN_PANELS[key].label}`}
            className="relative rounded p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <Glyph name={SCREEN_PANELS[key].glyph} size={15} />
            <Badge
              count={badges[key]}
              waiting={wear(key).status === 'waiting'}
            />
          </button>
        </li>
      ))}
    </ul>
  );

  const addControl = (region: Region) =>
    arranging && spare.length > 0 ? (
      <Select
        aria-label={`Add a panel ${REGION_LABEL[region].toLowerCase()}`}
        size="sm"
        className="ml-auto w-32"
        classNames={{ trigger: 'h-7 min-h-7' }}
        placeholder="Add"
        selectedKeys={[]}
        onSelectionChange={keys => {
          const key = Array.from(keys)[0];
          if (key) add(String(key) as ScreenPanelKey, region);
        }}
      >
        {spare.map(key => (
          <SelectItem key={key} textValue={SCREEN_PANELS[key].label}>
            {SCREEN_PANELS[key].label}
          </SelectItem>
        ))}
      </Select>
    ) : null;

  /* --- a phone held sideways ------------------------------------------- */

  if (sideways) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={regionRef}
          data-board-region
          className="min-h-0 flex-1 overflow-auto"
        >
          <Panel
            title={titleOf('board')}
            status={wear('board').status}
            statusDetail={wear('board').detail}
            scroll={false}
            padded={false}
            className="h-full rounded-none border-0 shadow-none"
          >
            {board(regionHeight)}
          </Panel>
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
            Panels
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
              Panels
            </DrawerHeader>
            <DrawerBody className="p-0">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {all.map(key => panel(key, regionOf(key)))}
              </div>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  /* --- everything else ------------------------------------------------- */

  const flank = (side: 'left' | 'right') => {
    const keys = layout[side];
    if (!open && side === 'left') return null;
    if (open && keys.length === 0 && !arranging) return null;
    return (
      <aside
        aria-label={REGION_LABEL[side]}
        className={`flex min-h-0 shrink-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface [box-shadow:var(--shadow-card)] transition-[width] max-lg:max-h-[45vh] ${
          open ? 'lg:w-[19rem] xl:w-[22rem]' : 'lg:w-11'
        }`}
      >
        <header className="flex shrink-0 items-center gap-1 border-b border-line px-1.5 py-1">
          {side === 'right' && (
            <button
              type="button"
              onClick={() => onChange({ ...layout, open: !open })}
              className="rounded p-1 text-ink-muted hover:text-ink"
              aria-label={open ? 'Fold the panels away' : 'Open the panels'}
              title={open ? 'Fold the panels away' : 'Open the panels'}
            >
              <Glyph name={open ? 'x' : 'plus'} size={13} />
            </button>
          )}
          {open && (
            <span className="px-1 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
              {side === 'left' ? 'Left' : 'Right'}
            </span>
          )}
          {open && addControl(side)}
        </header>
        {!open &&
          side === 'right' &&
          strip(key => {
            onChange({
              ...layout,
              open: true,
              folded: layout.folded.filter(k => k !== key),
            });
          }, false)}
        {open && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {keys.map(key => panel(key, side))}
            {dropLast(side)}
            {keys.length === 0 && !dragged && (
              <p className="px-3 py-4 text-xs text-ink-subtle">
                Nothing here. Add a panel above.
              </p>
            )}
          </div>
        )}
      </aside>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        {flank('left')}

        {/* The board. It owns its own scroll; the page never does. */}
        <Panel
          title={titleOf('board')}
          status={wear('board').status}
          statusDetail={wear('board').detail}
          scroll={false}
          padded={false}
          className="min-h-0 flex-1"
        >
          <div
            ref={regionRef}
            data-board-region
            className="h-full min-h-0 overflow-auto"
          >
            <div className="p-2">{board(regionHeight)}</div>
          </div>
        </Panel>

        {flank('right')}
      </div>

      {/* The rail under the board: short, wide panels, side by side. */}
      {open && (layout.rail.length > 0 || (arranging && dragged)) && (
        <div
          aria-label={REGION_LABEL.rail}
          className="flex shrink-0 flex-wrap items-start gap-1 rounded-[var(--radius-card)] border border-line bg-surface p-1 [box-shadow:var(--shadow-card)]"
        >
          {layout.rail.map(key => panel(key, 'rail'))}
          {dropLast('rail')}
        </div>
      )}
      {open && arranging && layout.rail.length === 0 && !dragged && (
        <div className="flex shrink-0 items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line px-2 py-1">
          <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
            Under the board
          </span>
          {addControl('rail')}
        </div>
      )}
    </div>
  );
}
