'use client';

/**
 * The tool panel: one tool's settings at a time, beside the rail.
 *
 * Each panel is the tool's whole vocabulary — a room's quick sizes and
 * its floor, a wall's four ways of being drawn and six kinds, the stamps
 * shelf with its search — and nothing of any other tool's. The one control
 * that recurs, the brush, is one component.
 */
import { Input } from '@heroui/react';
import { useState } from 'react';

import type { BrushSize } from '@/@creator/campaign/lib/battlemap';
import {
  DENSITY_SHARE,
  type Density,
  type ScatterKind,
} from '@/@creator/campaign/lib/board-edit';
import {
  CELL,
  STAMP_CATEGORIES,
  STAMPS,
  type Stamp,
} from '@/@creator/campaign/lib/stamps';
import {
  FACINGS,
  LEVEL_SEENS,
  MATERIALS,
  VOID,
  WALL_HEIGHT,
  WEATHERS,
  WEATHER_META,
  type Ambient,
  type BoardDoc,
  type Facing,
  type ItemState,
  type LevelDoc,
  type WallKind,
  type Weather,
} from '@/@shared/battlemap/types';
import { Marginalia } from '@/@shared/components/ui';
import { ImagePicker } from '../ImagePicker';
import {
  ERASE_WHATS,
  ROOM_SIZES,
  type HeightMode,
  type PaintMode,
  type Selection,
  type Settings,
  type WallMode,
  type WorkshopTool,
} from './workshop-state';

/** A small caps label over a group of controls. */
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted">
      {children}
    </span>
  );
}

/** A switch row: a label and a track. */
export function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-9 items-center justify-between gap-2.5 text-left text-[13px] text-ink"
    >
      <span>{label}</span>
      <span
        className={`relative h-5 w-[34px] shrink-0 rounded-full transition-colors ${
          on ? 'bg-gold' : 'bg-line'
        }`}
      >
        <span
          className="absolute top-[3px] h-3.5 w-3.5 rounded-full bg-surface transition-[left]"
          style={{ left: on ? 17 : 3 }}
        />
      </span>
    </button>
  );
}

/** A chip row that picks one of a few. */
export function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && <Label>{label}</Label>}
      <div className="flex gap-0.5 rounded-lg border border-line bg-surface-2 p-[3px]">
        {options.map(o => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === value}
            onClick={() => onChange(o.id)}
            className={`h-9 grow rounded-md text-[13px] font-medium transition-colors ${
              o.id === value
                ? 'bg-gold text-bg'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const BRUSHES: BrushSize[] = [1, 2, 3, 4, 5];

export function BrushPicker({
  brush,
  onChange,
}: {
  brush: BrushSize;
  onChange: (b: BrushSize) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>BRUSH</Label>
      <div className="grid grid-cols-5 gap-1">
        {BRUSHES.map(b => (
          <button
            key={b}
            type="button"
            aria-pressed={b === brush}
            onClick={() => onChange(b)}
            className={`h-11 rounded-lg border text-xs font-medium transition-colors ${
              b === brush
                ? 'border-gold bg-gold text-bg'
                : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {b * 2 - 1}×{b * 2 - 1}
          </button>
        ))}
      </div>
    </div>
  );
}

const card = (on: boolean) =>
  `rounded-lg border text-left transition-colors ${
    on
      ? 'border-gold bg-gold/10 text-gold-strong dark:text-gold'
      : 'border-line bg-surface-2 text-ink hover:border-ink-subtle'
  }`;

export function WorkshopPanel({
  tool,
  settings,
  set,
  terrain,
  doc,
  dark,
  selection,
  box,
  above,
  onCopyToFloor,
  onTurn,
  onRemove,
  onSaveStamp,
  onAmbient,
  onWeather,
  onRevealRooms,
  onHideFloor,
  campaignId,
}: {
  tool: WorkshopTool;
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
  terrain: LevelDoc;
  doc: BoardDoc;
  dark: boolean;
  selection: Selection;
  box: { x: number; y: number; w: number; h: number } | null;
  above: LevelDoc | null;
  onCopyToFloor: (levelId: string, move: boolean) => void;
  onTurn: () => void;
  onRemove: () => void;
  onSaveStamp: () => void;
  onAmbient: (a: Ambient) => void;
  onWeather: (w: Weather) => void;
  onRevealRooms: () => void;
  onHideFloor: () => void;
  campaignId: string;
}) {
  const swatch = (i: number) =>
    i === VOID
      ? 'repeating-linear-gradient(45deg, #2a231a 0 3px, #16130f 3px 6px)'
      : dark
        ? MATERIALS[i].swatchDark
        : MATERIALS[i].swatch;
  const [moveTo, setMoveTo] = useState(false);

  switch (tool) {
    case 'rooms':
      return (
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <Label>QUICK SIZE</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {ROOM_SIZES.map(r => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={settings.roomSize === r}
                  onClick={() =>
                    set({ roomSize: settings.roomSize === r ? 'drag' : r })
                  }
                  className={`h-11 rounded-lg border text-[13px] font-medium ${
                    settings.roomSize === r
                      ? 'border-gold bg-gold text-bg'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <Marginalia dash>
              {settings.roomSize === 'drag'
                ? 'or drag any box'
                : 'tap to put it down · tap the size again to drag instead'}
            </Marginalia>
          </div>
          <div className="flex flex-col gap-2">
            <Label>FLOOR</Label>
            <div className="flex gap-1.5">
              {MATERIALS.map((m, i) =>
                i === VOID || m.impassable ? null : (
                  <button
                    key={m.key}
                    type="button"
                    aria-label={m.name}
                    aria-pressed={settings.roomMat === i}
                    onClick={() => set({ roomMat: i })}
                    className={`h-[30px] w-[30px] rounded-md border-2 ${
                      settings.roomMat === i
                        ? 'border-gold'
                        : 'border-transparent'
                    }`}
                    style={{ background: swatch(i) }}
                    title={m.name}
                  />
                )
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>WHEN I LET GO</Label>
            <Toggle
              label="Put a door where it meets a room"
              on={settings.roomDoor}
              onChange={roomDoor => set({ roomDoor })}
            />
            <Toggle
              label="Share walls with neighbors"
              on={settings.roomMerge}
              onChange={roomMerge => set({ roomMerge })}
            />
            <Toggle
              label="Ask me to name it"
              on={settings.roomName}
              onChange={roomName => set({ roomName })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ROOMS ON THIS FLOOR</Label>
            {(terrain.rooms ?? []).length === 0 && (
              <Marginalia dash>none named yet</Marginalia>
            )}
            {(terrain.rooms ?? []).map(r => (
              <div
                key={`${r.x},${r.y}`}
                className="flex items-center gap-2.5 rounded-md bg-surface-2 px-2.5 py-[7px] text-[13px]"
              >
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{
                    background: swatch(
                      terrain.material[r.y * terrain.w + r.x] ?? VOID
                    ),
                  }}
                />
                <span className="grow">{r.name}</span>
                <span className="tabular-nums text-ink-muted">
                  {r.w} × {r.h}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'walls': {
      const modes: { id: WallMode; label: string; sub: string }[] = [
        { id: 'edge', label: 'One edge', sub: 'tap a grid line' },
        { id: 'line', label: 'A run', sub: 'drag along a line' },
        { id: 'box', label: 'Outline', sub: 'drag a box' },
        { id: 'erase', label: 'Knock down', sub: 'drag over walls' },
      ];
      const kinds: { id: WallKind; label: string; sw: string; th: number }[] = [
        { id: 'solid', label: 'Wall', sw: dark ? '#d8ccb4' : '#3a3530', th: 6 },
        { id: 'door', label: 'Door', sw: dark ? '#d9b061' : '#b4894a', th: 6 },
        {
          id: 'window',
          label: 'Window',
          sw: dark ? '#8aa4bd' : '#4a6076',
          th: 4,
        },
        {
          id: 'rail',
          label: 'Rail',
          sw: 'repeating-linear-gradient(90deg, #a89f8d 0 5px, transparent 5px 8px)',
          th: 3,
        },
        { id: 'hedge', label: 'Hedge', sw: '#5f7d43', th: 7 },
        {
          id: 'fence',
          label: 'Fence',
          sw: 'repeating-linear-gradient(90deg, #a3804f 0 3px, transparent 3px 6px)',
          th: 5,
        },
      ];
      return (
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <Label>DRAW</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {modes.map(m => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={settings.wallMode === m.id}
                  onClick={() => set({ wallMode: m.id })}
                  className={`flex flex-col items-start gap-0.5 px-2.5 py-[9px] ${card(
                    settings.wallMode === m.id
                  )}`}
                >
                  <span className="text-[13px] font-semibold">{m.label}</span>
                  <span className="text-[11px] text-ink-muted">{m.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>KIND</Label>
            <div className="flex flex-col gap-1">
              {kinds.map(k => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={settings.wallKind === k.id}
                  onClick={() => set({ wallKind: k.id })}
                  className={`flex h-[38px] items-center gap-3 px-2.5 text-[13px] ${card(
                    settings.wallKind === k.id
                  )}`}
                >
                  <span
                    className="w-7 rounded-sm"
                    style={{ height: k.th, background: k.sw }}
                  />
                  <span className="grow">{k.label}</span>
                  <span className="text-[11px] text-ink-muted">
                    {WALL_HEIGHT[k.id]} ft
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'floor': {
      const modes: { id: PaintMode; label: string }[] = [
        { id: 'brush', label: 'Brush' },
        { id: 'box', label: 'Box' },
        { id: 'fill', label: 'Fill' },
      ];
      return (
        <div className="flex flex-col gap-[18px]">
          <div className="grid grid-cols-2 gap-1.5">
            {MATERIALS.map((m, i) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={settings.mat === i}
                onClick={() => set({ mat: i })}
                className={`flex h-10 items-center gap-2 px-2 text-[13px] ${card(
                  settings.mat === i
                )}`}
              >
                <span
                  className="h-[22px] w-[22px] rounded border border-line"
                  style={{ background: swatch(i) }}
                />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
          <Segment
            label="HOW"
            value={settings.paintMode}
            options={modes}
            onChange={paintMode => set({ paintMode })}
          />
          {settings.paintMode === 'brush' && (
            <BrushPicker
              brush={settings.brush}
              onChange={brush => set({ brush })}
            />
          )}
        </div>
      );
    }

    case 'height': {
      const modes: { id: HeightMode; label: string }[] = [
        { id: 'raise', label: 'Raise' },
        { id: 'lower', label: 'Lower' },
        { id: 'set', label: 'Set to' },
      ];
      /*
       * The step, in feet, with the whole range reachable.
       *
       * The pair of arrows used to move by 5 and clamp at 1, so a DM who
       * went down to 1 ft and pressed + landed on 6 and could never get
       * back to 5. The arrows snap to the 5-ft grid the game thinks in,
       * the row of sizes is the fast path, and the field takes any number
       * — including 0, which the Set mode needs to flatten ground back to
       * the datum.
       */
      const nudge = (by: 1 | -1) => {
        const v = settings.step;
        const snapped =
          by > 0 ? Math.floor(v / 5) * 5 + 5 : Math.ceil(v / 5) * 5 - 5;
        set({ step: Math.max(0, Math.min(200, snapped)) });
      };
      return (
        <div className="flex flex-col gap-[18px]">
          <Segment
            value={settings.heightMode}
            options={modes}
            onChange={heightMode => set({ heightMode })}
          />
          <div className="flex flex-col gap-2">
            <Label>
              {settings.heightMode === 'set' ? 'HEIGHT' : 'STEP'} · FEET
            </Label>
            <div className="flex items-center gap-1.5">
              <div className="flex grow items-center rounded-lg border border-line">
                <button
                  type="button"
                  aria-label="Five feet less"
                  onClick={() => nudge(-1)}
                  className="h-9 w-9 text-base text-ink"
                >
                  −
                </button>
                <Input
                  size="sm"
                  type="number"
                  aria-label="Feet"
                  classNames={{
                    inputWrapper: 'h-9 min-h-9 bg-transparent shadow-none',
                    input: 'text-center tabular-nums',
                  }}
                  value={String(settings.step)}
                  onValueChange={v => {
                    const n = Math.trunc(Number(v));
                    if (v.trim() === '') return set({ step: 0 });
                    if (!Number.isFinite(n)) return;
                    set({ step: Math.max(0, Math.min(200, n)) });
                  }}
                />
                <button
                  type="button"
                  aria-label="Five feet more"
                  onClick={() => nudge(1)}
                  className="h-9 w-9 text-base text-ink"
                >
                  +
                </button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[0, 1, 5, 10, 20].map(ft => (
                <button
                  key={ft}
                  type="button"
                  aria-pressed={settings.step === ft}
                  onClick={() => set({ step: ft })}
                  className={`h-8 rounded-lg border text-xs ${
                    settings.step === ft
                      ? 'border-gold bg-gold font-semibold text-bg'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {ft}
                </button>
              ))}
            </div>
          </div>
          {settings.heightMode !== 'set' && (
            <button
              type="button"
              onClick={() => set({ heightMode: 'set', step: 0 })}
              className="h-10 rounded-lg border border-line bg-surface-2 text-[13px] text-ink hover:border-ink-subtle"
            >
              Flatten back to the ground
            </button>
          )}
          <BrushPicker
            brush={settings.brush}
            onChange={brush => set({ brush })}
          />
          <p className="text-xs leading-relaxed text-ink-muted">
            Height is measured from this floor, not from the garden. A dais in
            the great hall is +5 ft on the ground floor. 1-ft steps are legal;
            the arrows move in 5s because the game does.
          </p>
        </div>
      );
    }

    case 'scatter': {
      const items: {
        id: ScatterKind;
        name: string;
        color: string;
        dot: number;
        rad: string;
      }[] = [
        {
          id: 'tree',
          name: 'Oak',
          color: 'radial-gradient(circle at 35% 35%, #6f8a4f, #3f5a2c 70%)',
          dot: 24,
          rad: '50%',
        },
        {
          id: 'pine',
          name: 'Pine',
          color: '#3f5a3a',
          dot: 20,
          rad: '50% 50% 20% 20%',
        },
        { id: 'bush', name: 'Bush', color: '#5f7d43', dot: 14, rad: '50%' },
        {
          id: 'boulder',
          name: 'Boulder',
          color: '#8a8272',
          dot: 18,
          rad: '40%',
        },
        { id: 'rubble', name: 'Rubble', color: '#6e6658', dot: 10, rad: '2px' },
        {
          id: 'mushroom',
          name: 'Toadstools',
          color: '#b5543f',
          dot: 10,
          rad: '50%',
        },
      ];
      const densities: { id: Density; label: string }[] = [
        { id: 'sparse', label: 'Sparse' },
        { id: 'some', label: 'Some' },
        { id: 'thick', label: 'Thick' },
      ];
      return (
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <Label>WHAT GROWS</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {items.map(i => (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={settings.scatterKind === i.id}
                  onClick={() => set({ scatterKind: i.id })}
                  className={`flex h-16 flex-col items-center justify-center gap-1.5 text-xs ${card(
                    settings.scatterKind === i.id
                  )}`}
                >
                  <span
                    className="border border-black/40"
                    style={{
                      width: i.dot,
                      height: i.dot,
                      borderRadius: i.rad,
                      background: i.color,
                    }}
                  />
                  <span>{i.name}</span>
                </button>
              ))}
            </div>
          </div>
          <BrushPicker
            brush={settings.brush}
            onChange={brush => set({ brush })}
          />
          <Segment
            label="HOW THICK"
            value={settings.density}
            options={densities}
            onChange={density => set({ density })}
          />
          <div className="flex flex-col">
            <Toggle
              label={`${items.find(i => i.id === settings.scatterKind)?.name ?? 'Trees'}s block movement`}
              on={settings.scatterBlocks}
              onChange={scatterBlocks => set({ scatterBlocks })}
            />
            <Toggle
              label="Vary the size"
              on={settings.scatterVary}
              onChange={scatterVary => set({ scatterVary })}
            />
            <Toggle
              label="Stay off floors and walls"
              on={settings.scatterAvoid}
              onChange={scatterAvoid => set({ scatterAvoid })}
            />
          </div>
          <Marginalia dash>
            about {Math.round(DENSITY_SHARE[settings.density] * 100)}% of the
            brush fills
          </Marginalia>
        </div>
      );
    }

    case 'stamps': {
      const cats = ['All', ...STAMP_CATEGORIES] as const;
      const q = settings.stampSearch.trim().toLowerCase();
      const shown = STAMPS.filter(
        s =>
          (settings.stampCat === 'All' || s.cat === settings.stampCat) &&
          (!q || s.name.toLowerCase().includes(q) || s.note.includes(q))
      );
      return (
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <Label>FIND A STAMP</Label>
            <Input
              size="sm"
              type="search"
              placeholder="stairs, grove, tower…"
              aria-label="Find a stamp"
              value={settings.stampSearch}
              onValueChange={stampSearch => set({ stampSearch })}
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {cats.map(c => (
              <button
                key={c}
                type="button"
                aria-pressed={settings.stampCat === c}
                onClick={() => set({ stampCat: c })}
                className={`h-[30px] rounded-full border px-2.5 text-xs font-medium ${
                  settings.stampCat === c
                    ? 'border-gold bg-gold text-bg'
                    : 'border-line text-ink-muted hover:text-ink'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {shown.map(s => (
              <StampCard
                key={s.id}
                stamp={s}
                on={settings.stamp === s.id}
                onPick={() => set({ stamp: s.id })}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => set({ stampTurns: (settings.stampTurns + 1) % 4 })}
              className="h-[38px] grow rounded-lg border border-line text-xs text-ink hover:bg-surface-2"
            >
              Turn · R
            </button>
            <button
              type="button"
              onClick={() => set({ stampFlip: !settings.stampFlip })}
              className="h-[38px] grow rounded-lg border border-line text-xs text-ink hover:bg-surface-2"
            >
              Flip · F
            </button>
          </div>
        </div>
      );
    }

    case 'select': {
      const actions = [
        {
          label: above
            ? 'Copy to the floor above'
            : 'Copy to the floor above · none',
          key: 'Ctrl ↑',
          on: () => above && onCopyToFloor(above.id, false),
          disabled: !box || !above,
        },
        {
          label: 'Move to another floor…',
          key: '',
          on: () => setMoveTo(v => !v),
          disabled: !box || doc.levels.length < 2,
        },
        { label: 'Save as a stamp', key: 'S', on: onSaveStamp, disabled: !box },
        { label: 'Turn it', key: 'R', on: onTurn, disabled: !box },
        {
          label: `Remove ${
            selection?.kind === 'box'
              ? (
                  ERASE_WHATS.find(w => w.id === settings.eraseWhat)?.label ??
                  'it'
                ).toLowerCase()
              : 'it'
          }`,
          key: 'Del',
          on: onRemove,
          disabled: !selection,
          danger: true,
        },
      ];
      return (
        <div className="flex flex-col gap-2">
          <Label>WITH WHAT YOU GRABBED</Label>
          {actions.map(a => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={a.on}
              className={`flex h-10 items-center justify-between rounded-lg border border-line bg-surface-2 px-3 text-left text-[13px] transition-colors disabled:opacity-40 ${
                a.danger ? 'text-danger' : 'text-ink hover:border-ink-subtle'
              }`}
            >
              <span>{a.label}</span>
              <span className="text-[11px] text-ink-muted">{a.key}</span>
            </button>
          ))}
          {moveTo && box && (
            <div className="flex flex-col gap-1 rounded-lg border border-gold/40 p-2">
              <Label>TO</Label>
              {[...doc.levels]
                .reverse()
                .filter(l => l.id !== terrain.id)
                .map(l => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      onCopyToFloor(l.id, true);
                      setMoveTo(false);
                    }}
                    className="rounded-md px-2 py-1.5 text-left text-[13px] text-ink hover:bg-surface-2"
                  >
                    {l.name}
                  </button>
                ))}
            </div>
          )}
          {/* What "Remove" takes. It used to take the whole tile — floor,
              height, walls and all — and a DM deleting a hedge lost the
              lawn. The choice is the Erase tool's, so the two agree. */}
          {box && (
            <div className="flex flex-col gap-1.5">
              <Label>REMOVE TAKES</Label>
              <div className="grid grid-cols-3 gap-1">
                {ERASE_WHATS.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    aria-pressed={settings.eraseWhat === w.id}
                    onClick={() => set({ eraseWhat: w.id })}
                    className={`h-8 rounded-lg border text-[11px] ${
                      settings.eraseWhat === w.id
                        ? 'border-gold bg-gold font-semibold text-bg'
                        : 'border-line text-ink-muted hover:text-ink'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!box && (
            <Marginalia dash>
              drag a box on the board to grab something
            </Marginalia>
          )}
          {box && (
            <Marginalia dash>
              {box.w} × {box.h} tiles grabbed
            </Marginalia>
          )}
        </div>
      );
    }

    case 'things': {
      const states: { id: ItemState | null; label: string }[] = [
        { id: 'open', label: 'Open' },
        { id: 'closed', label: 'Closed' },
        { id: 'locked', label: 'Locked' },
        { id: 'broken', label: 'Broken' },
      ];
      return (
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span>Called</span>
            <Input
              size="sm"
              aria-label="What it is called"
              placeholder="Cellar door"
              value={settings.thingLabel}
              onValueChange={thingLabel => set({ thingLabel })}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px]">Starts</span>
            <div className="grid grid-cols-4 gap-1">
              {states.map(s => (
                <button
                  key={s.label}
                  type="button"
                  aria-pressed={settings.thingState === s.id}
                  onClick={() => set({ thingState: s.id })}
                  className={`h-9 rounded-lg border text-xs ${
                    settings.thingState === s.id
                      ? 'border-gold bg-gold font-semibold text-bg'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              size="sm"
              type="number"
              label="Lock DC"
              isDisabled={settings.thingState !== 'locked'}
              value={
                settings.thingLockDc === null
                  ? ''
                  : String(settings.thingLockDc)
              }
              onValueChange={v =>
                set({
                  thingLockDc:
                    v.trim() === '' ? null : Math.trunc(Number(v)) || null,
                })
              }
            />
            <Input
              size="sm"
              type="number"
              label="Hit points"
              placeholder="unbreakable"
              value={settings.thingHp === null ? '' : String(settings.thingHp)}
              onValueChange={v =>
                set({
                  thingHp:
                    v.trim() === '' ? null : Math.trunc(Number(v)) || null,
                })
              }
            />
          </div>
          <Marginalia dash>
            tap a tile to put it down — it lands in the rail on the right, where
            you say what it does when used. tap again for another.
          </Marginalia>
        </div>
      );
    }

    case 'light':
      return (
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <Label>REACH</Label>
            <div className="grid grid-cols-4 gap-1">
              {[10, 20, 30, 40].map(ft => (
                <button
                  key={ft}
                  type="button"
                  aria-pressed={settings.lightReach === ft}
                  onClick={() => set({ lightReach: ft })}
                  className={`h-10 rounded-lg border text-xs ${
                    settings.lightReach === ft
                      ? 'border-gold bg-gold font-semibold text-bg'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {ft} ft
                </button>
              ))}
            </div>
          </div>
          <Segment
            label="THIS FLOOR IS"
            value={terrain.ambient}
            options={[
              { id: 'bright', label: 'Bright' },
              { id: 'dim', label: 'Dim' },
              { id: 'dark', label: 'Dark' },
            ]}
            onChange={onAmbient}
          />
          <p className="text-xs leading-relaxed text-ink-muted">
            Each floor keeps its own light, so the cellar can be pitch dark
            under a sunny garden.
          </p>

          {/* Weather is per floor for the same reason light is: it rains on
              the roof and not in the crypt. */}
          <div className="flex flex-col gap-2 border-t border-line pt-[18px]">
            <Label>WEATHER</Label>
            <div className="grid grid-cols-3 gap-1">
              {WEATHERS.map(w => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={(terrain.weather ?? 'clear') === w}
                  onClick={() => onWeather(w)}
                  className={`h-9 rounded-lg border text-xs ${
                    (terrain.weather ?? 'clear') === w
                      ? 'border-gold bg-gold font-semibold text-bg'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {WEATHER_META[w].name}
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              {WEATHER_META[terrain.weather ?? 'clear'].line}
              {WEATHER_META[terrain.weather ?? 'clear'].rule
                ? ` ${WEATHER_META[terrain.weather ?? 'clear'].rule}`
                : ''}
            </p>
          </div>
        </div>
      );

    case 'erase':
      return (
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <Label>RUB OUT</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {ERASE_WHATS.map(w => (
                <button
                  key={w.id}
                  type="button"
                  aria-pressed={settings.eraseWhat === w.id}
                  onClick={() => set({ eraseWhat: w.id })}
                  className={`flex flex-col items-start gap-0.5 px-2.5 py-[9px] ${card(
                    settings.eraseWhat === w.id
                  )}`}
                >
                  <span className="text-[13px] font-semibold">{w.label}</span>
                  <span className="text-[11px] text-ink-muted">{w.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <BrushPicker
            brush={settings.brush}
            onChange={brush => set({ brush })}
          />
          <p className="text-xs leading-relaxed text-ink-muted">
            One kind at a time, so a hedge can go without taking the lawn it
            stood on. Everything is the whole tile — floor, height, walls and
            all.
          </p>
        </div>
      );

    case 'pictures': {
      const facings: { id: Facing; label: string }[] = [
        { id: 'camera', label: 'Faces you' },
        { id: 'n', label: 'North' },
        { id: 'e', label: 'East' },
        { id: 's', label: 'South' },
        { id: 'w', label: 'West' },
      ];
      void FACINGS;
      return (
        <div className="flex flex-col gap-[18px]">
          {/* The campaign's own pictures, and an upload beside them: one
              fountain uploaded once and stood up in six places. */}
          <ImagePicker
            campaignId={campaignId}
            label="THE PICTURE"
            library
            hint={false}
            value={settings.pictureImageId}
            onChange={pictureImageId => set({ pictureImageId })}
          />
          <div className="flex flex-col gap-2">
            <Label>HOW TALL · FEET</Label>
            <div className="grid grid-cols-5 gap-1">
              {[3, 6, 10, 20, 40].map(ft => (
                <button
                  key={ft}
                  type="button"
                  aria-pressed={settings.pictureHeight === ft}
                  onClick={() => set({ pictureHeight: ft })}
                  className={`h-9 rounded-lg border text-xs ${
                    settings.pictureHeight === ft
                      ? 'border-gold bg-gold font-semibold text-bg'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {ft}
                </button>
              ))}
            </div>
            <Input
              size="sm"
              type="number"
              aria-label="How tall, in feet"
              value={String(settings.pictureHeight)}
              onValueChange={v => {
                const n = Math.trunc(Number(v));
                if (!Number.isFinite(n)) return;
                set({ pictureHeight: Math.max(1, Math.min(100, n)) });
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>WHICH WAY IT FACES</Label>
            <div className="grid grid-cols-3 gap-1">
              {facings.map(f => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={settings.pictureFacing === f.id}
                  onClick={() => set({ pictureFacing: f.id })}
                  className={`h-9 rounded-lg border text-xs ${
                    settings.pictureFacing === f.id
                      ? 'border-gold bg-gold font-semibold text-bg'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            label="It blocks the tile"
            on={settings.pictureBlocks}
            onChange={pictureBlocks => set({ pictureBlocks })}
          />
          <Marginalia dash>
            tap a tile to stand it up · the wheel turns a fixed one · erase it
            with the rubber, set to Things
          </Marginalia>
        </div>
      );
    }

    case 'fog':
      return (
        <div className="flex flex-col gap-[18px]">
          <BrushPicker
            brush={settings.brush}
            onChange={brush => set({ brush })}
          />
          <button
            type="button"
            onClick={onRevealRooms}
            className="h-10 rounded-lg border border-line bg-surface-2 text-[13px] text-ink hover:border-ink-subtle"
          >
            Show the whole room they&apos;re in
          </button>
          <button
            type="button"
            onClick={onHideFloor}
            className="h-10 rounded-lg border border-line bg-surface-2 text-[13px] text-ink hover:border-ink-subtle"
          >
            Hide this floor again
          </button>
          <p className="text-xs leading-relaxed text-ink-muted">
            Fog of war is kept per floor. Showing the landing shows nothing of
            the cellar.
          </p>
          <Marginalia dash>
            the party sees this floor{' '}
            {terrain.seen === 'always'
              ? 'always'
              : terrain.seen === 'reveal'
                ? 'only where you reveal it'
                : 'once a hero is on it'}{' '}
            — set in the rail
          </Marginalia>
        </div>
      );
  }
  void LEVEL_SEENS;
  return null;
}

function StampCard({
  stamp,
  on,
  onPick,
}: {
  stamp: Stamp;
  on: boolean;
  onPick: () => void;
}) {
  const w = stamp.fragment.w;
  const h = stamp.fragment.h;
  const cell = Math.max(
    3,
    Math.min(10, Math.floor(Math.min(110 / w, 48 / h)) - 1)
  );
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={`flex flex-col items-stretch gap-1.5 p-2 ${card(on)}`}
    >
      <span className="flex h-14 items-center justify-center rounded bg-bg">
        <span
          className="grid gap-px"
          style={{
            gridTemplateColumns: `repeat(${w}, ${cell}px)`,
            gridAutoRows: `${cell}px`,
          }}
        >
          {stamp.preview.map((ch, i) => (
            <span
              key={i}
              className="rounded-[1px]"
              style={{ background: CELL[ch] ?? 'transparent' }}
            />
          ))}
        </span>
      </span>
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-xs font-medium">{stamp.name}</span>
        <span className="text-[11px] text-ink-muted">
          {w} × {h}
        </span>
      </span>
      <span
        className={`text-[11px] ${stamp.link ? 'text-gold-strong dark:text-gold' : 'text-ink-muted'}`}
      >
        {stamp.note}
      </span>
    </button>
  );
}
