'use client';

/**
 * The workshop, stood up: the house in three dimensions.
 *
 * Three ways to stand it: cutaway (everything above the floor in front
 * lifts off, and its own walls drop to knee height so the DM can look
 * in), stacked (the whole house, the floors above turned to glass), and
 * pulled apart (the floors spread out with the stairs drawn between them).
 * The stage is `BattleMap3D` with a stack handed to it; the elevator on
 * the right picks a floor and the bar at the foot turns, tilts and zooms
 * the camera. Nothing here edits: the flat board is the authoring surface.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { feetLabel, levelOf, type BoardDoc } from '@/@shared/battlemap/types';
import { Glyph, Marginalia } from '@/@shared/components/ui';
import type { WorkshopToken } from '@/server/battlemap';
import type { EntryRow } from '@/server/session';
import { BattleMap3DLazy } from '../session/BattleMap3DLazy';
import type { BattleMap3DProps } from '../session/BattleMap3D';
import { Toggle } from './WorkshopPanel';

type StandMode = 'cutaway' | 'stacked' | 'exploded';

/** Board units a foot: five feet a tile, one unit a tile. */
const UNIT_PER_FOOT = 1 / 5;
/** How far apart the floors stand when pulled apart, in units. */
const GAP = 4;

const SCATTER = new Set([
  'tree',
  'pine',
  'bush',
  'boulder',
  'mushroom',
  'rubble',
]);

export function WorkshopStage({
  doc,
  levelId,
  onLevel,
  tokens,
  entriesById,
  faces,
  imageUrlFor,
  dark,
  onFlat,
}: {
  campaignId: string;
  doc: BoardDoc;
  levelId: string;
  onLevel: (id: string) => void;
  tokens: WorkshopToken[];
  entriesById: Map<string, EntryRow>;
  faces: Map<string, HTMLImageElement>;
  imageUrlFor: (imageId: string) => string;
  dark: boolean;
  onFlat: () => void;
}) {
  const [mode, setMode] = useState<StandMode>('cutaway');
  const [low, setLow] = useState(true);
  const [garden, setGarden] = useState(true);
  const [showTokens, setShowTokens] = useState(true);
  const camera =
    useRef<NonNullable<BattleMap3DProps['cameraRef']>['current']>(null);

  const level = levelOf(doc, levelId);
  const ai = doc.levels.findIndex(l => l.id === level.id);
  // A new way of standing, or a new floor in front, is framed again.
  useEffect(() => {
    const t = setTimeout(() => camera.current?.fit(), 50);
    return () => clearTimeout(t);
  }, [mode, ai]);

  const stack = useMemo<NonNullable<BattleMap3DProps['stack']>>(() => {
    const yOf = (i: number) =>
      doc.levels[i].feet * UNIT_PER_FOOT +
      (mode === 'exploded' ? (i - ai) * GAP : 0);
    const strip = (l: (typeof doc.levels)[number]) =>
      garden ? l : { ...l, props: l.props.filter(p => !SCATTER.has(p.kind)) };
    const levels = doc.levels
      .map((l, i) => {
        let show = true;
        let opacity = 1;
        if (mode === 'cutaway') show = i <= ai;
        else if (mode === 'stacked') opacity = i > ai ? 0.12 : 1;
        else opacity = i === ai ? 1 : 0.5;
        return show
          ? {
              doc: strip(l),
              y: yOf(i),
              opacity,
              lowWalls: low && mode === 'cutaway' && i === ai,
              tokens: showTokens ? tokens.filter(t => t.level === l.id) : [],
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const shown = new Map(levels.map(l => [l.doc.id, l]));
    const stairs = doc.links
      .filter(k => shown.has(k.from) && shown.has(k.to))
      .map(k => ({
        link: k,
        fromY: shown.get(k.from)!.y,
        toY: shown.get(k.to)!.y,
        opacity: Math.min(shown.get(k.from)!.opacity, shown.get(k.to)!.opacity),
      }));
    return { levels, stairs };
  }, [doc, mode, ai, low, garden, showTokens, tokens]);

  const modes: { id: StandMode; label: string; sub: string }[] = [
    {
      id: 'cutaway',
      label: 'Cutaway',
      sub: 'Everything above this floor lifts off. Its walls drop to knee height.',
    },
    {
      id: 'stacked',
      label: 'Stacked',
      sub: 'The whole house. Floors above turn to glass.',
    },
    {
      id: 'exploded',
      label: 'Pulled apart',
      sub: 'Floors spread out, stairs drawn between them.',
    },
  ];
  const modeLine = {
    cutaway: 'cut away above',
    stacked: 'the whole house',
    exploded: 'floors pulled apart',
  }[mode];
  const here = tokens.filter(t => t.level === level.id);
  const entries = Array.from(entriesById.values());

  return (
    <div className="flex min-h-0 grow">
      <aside className="flex w-[300px] shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-line bg-surface px-[18px] py-5">
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-xl">Floors</h2>
          <div className="flex flex-col gap-1">
            {[...doc.levels].reverse().map(l => {
              const on = l.id === level.id;
              const on_it = tokens.filter(t => t.level === l.id && t.entryId);
              const party = on_it.filter(t => t.side === 'party').length;
              const foes = on_it.filter(t => t.side === 'foe').length;
              const rooms = l.rooms?.length ?? 0;
              const bits = [`${rooms} ${rooms === 1 ? 'room' : 'rooms'}`];
              if (party)
                bits.push(`${party} ${party === 1 ? 'hero' : 'heroes'}`);
              if (foes) bits.push(`${foes} ${foes === 1 ? 'foe' : 'foes'}`);
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onLevel(l.id)}
                  className={`flex h-[52px] items-center gap-2.5 rounded-[10px] border px-3 text-left transition-colors ${
                    on
                      ? 'border-gold bg-gold/10'
                      : 'border-line bg-surface-2 hover:border-ink-subtle'
                  }`}
                >
                  <span
                    className={`w-11 text-xs font-semibold tabular-nums ${
                      on ? 'text-gold-strong dark:text-gold' : 'text-ink-muted'
                    }`}
                  >
                    {feetLabel(l.feet)}
                  </span>
                  <span className="flex grow flex-col gap-px">
                    <span className="text-sm font-medium">{l.name}</span>
                    <span className="text-[11px] text-ink-muted">
                      {bits.join(' · ')}
                    </span>
                  </span>
                  <span className="flex gap-[3px]">
                    {on_it.slice(0, 8).map(t => (
                      <span
                        key={t.id}
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${
                          t.side === 'foe'
                            ? 'bg-danger'
                            : t.side === 'party'
                              ? 'bg-gold'
                              : 'bg-ink-muted'
                        }`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-xl">How it stands</h2>
          <div className="flex flex-col gap-1.5">
            {modes.map(m => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                  mode === m.id
                    ? 'border-gold bg-gold/10'
                    : 'border-line bg-surface-2 hover:border-ink-subtle'
                }`}
              >
                <Glyph
                  name="cube"
                  size={22}
                  className={
                    mode === m.id
                      ? 'text-gold-strong dark:text-gold'
                      : 'text-ink-muted'
                  }
                />
                <span className="flex flex-col gap-0.5">
                  <span
                    className={`text-sm font-semibold ${
                      mode === m.id
                        ? 'text-gold-strong dark:text-gold'
                        : 'text-ink'
                    }`}
                  >
                    {m.label}
                  </span>
                  <span className="text-xs leading-snug text-ink-muted">
                    {m.sub}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col">
          <Toggle
            label="Knee-high walls on this floor"
            on={low}
            onChange={setLow}
          />
          <Toggle label="Show the garden" on={garden} onChange={setGarden} />
          <Toggle
            label="Show everyone on the board"
            on={showTokens}
            onChange={setShowTokens}
          />
        </section>

        <div className="grow" />
        <button
          type="button"
          onClick={onFlat}
          className="flex h-[42px] items-center justify-center rounded-[10px] border border-line text-[13px] font-medium text-ink hover:bg-surface-2"
        >
          Edit the {level.name.toLowerCase()} flat
        </button>
      </aside>

      <main
        className="relative min-w-0 grow overflow-hidden bg-bg"
        data-board-region
      >
        <div className="pointer-events-none absolute left-7 top-[22px] z-10 flex flex-col gap-0.5">
          <h1 className="font-display text-[30px] leading-none">
            {level.name}
          </h1>
          <span className="text-[13px] text-ink-muted">
            {feetLabel(level.feet)} · {modeLine}
          </span>
        </div>
        <div className="absolute inset-0">
          <BattleMap3DLazy
            terrain={level}
            tokens={here}
            entries={entries}
            currentEntryId={null}
            portraits={{}}
            faces={faces}
            imageUrlFor={imageUrlFor}
            dark={dark}
            fill
            stack={stack}
            cameraRef={camera}
          />
        </div>
        {/* The elevator */}
        <nav
          aria-label="Floors"
          className="absolute right-7 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-line bg-surface/95 p-1.5"
        >
          {[...doc.levels].reverse().map(l => {
            const on = l.id === level.id;
            return (
              <button
                key={l.id}
                type="button"
                aria-label={l.name}
                aria-pressed={on}
                onClick={() => onLevel(l.id)}
                className={`flex h-[52px] w-16 flex-col items-center justify-center gap-0.5 rounded-lg ${
                  on ? 'bg-gold text-bg' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <span className="text-xs font-semibold">
                  {l.name.split(' ')[0]}
                </span>
                <span className="text-[10px] opacity-80">
                  {feetLabel(l.feet)}
                </span>
              </button>
            );
          })}
        </nav>
        {/* The camera */}
        <div className="absolute bottom-[22px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border border-line bg-surface/95 p-1.5">
          <button
            type="button"
            aria-label="Turn left"
            onClick={() => camera.current?.turn(-45)}
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2 text-ink hover:text-gold"
          >
            <Glyph name="undo" size={18} />
          </button>
          <button
            type="button"
            aria-label="Turn right"
            onClick={() => camera.current?.turn(45)}
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2 text-ink hover:text-gold"
          >
            <Glyph name="redo" size={18} />
          </button>
          <span className="h-7 w-px bg-line" />
          <div className="flex gap-0.5">
            {(
              [
                ['From above', 12],
                ['Tilted', 50],
                ['Low', 72],
              ] as const
            ).map(([label, deg]) => (
              <button
                key={label}
                type="button"
                onClick={() => camera.current?.tilt(deg)}
                className="h-11 rounded-lg px-3.5 text-[13px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                {label}
              </button>
            ))}
          </div>
          <span className="h-7 w-px bg-line" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => camera.current?.zoom(1.25)}
            className="h-11 w-11 rounded-lg bg-surface-2 text-lg text-ink"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => camera.current?.zoom(0.8)}
            className="h-11 w-11 rounded-lg bg-surface-2 text-lg text-ink"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => camera.current?.fit()}
            className="h-11 rounded-lg px-3 text-[13px] text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            Fit
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-[30px] left-7 z-10">
          <Marginalia dash>drag to walk around it</Marginalia>
        </div>
      </main>
    </div>
  );
}
