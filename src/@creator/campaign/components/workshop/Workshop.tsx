'use client';

/**
 * The workshop: where a board is built.
 *
 * The sand table on the screen is for playing on; this is the bench
 * beside it, with the building tools moved out of the fight's way. A tool
 * rail down the left, the chosen tool's panel beside it, the board in the
 * middle, and a rail on the right for the floors and whatever is picked
 * up. The board is the artifact and the whole page is it.
 *
 * Every edit is a pure function on a floor (`board-edit.ts`) applied to a
 * local copy of the document, which is written whole after a pause and
 * kept on a stack so Undo is the document before. Things — a door with a
 * lock, a chest — are rows and not terrain, so they go to the server as
 * they are placed, the way the board on the screen places them.
 */
import { Button, Input } from '@heroui/react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  brushTiles,
  linkCostFeet,
  rectTiles,
  roomEdits,
  type Tile,
} from '@/@creator/campaign/lib/battlemap';
import {
  clearRegion,
  cutRegion,
  fillFrom,
  flipFragment,
  knockDown,
  nameRoom,
  paintTiles,
  pasteFragment,
  raiseTiles,
  rotateFragment,
  scatter,
  seeded,
  setHeight,
  setWall,
  toggleLight,
  wallOutline,
  wallRun,
  type Fragment,
} from '@/@creator/campaign/lib/board-edit';
import { CELL, findStamp, type Stamp } from '@/@creator/campaign/lib/stamps';
import { newLevelFrom } from '@/@creator/campaign/lib/battlemap';
import {
  feetLabel,
  levelOf,
  linkTiles,
  MATERIALS,
  shortId,
  TILE_FEET,
  withLevel,
  type BoardDoc,
  type LevelDoc,
  type LevelLink,
} from '@/@shared/battlemap/types';
import { usePortraits } from '@/@shared/battlemap/portraits';
import {
  DiceSpinner,
  Glyph,
  Marginalia,
  Ribbon,
} from '@/@shared/components/ui';
import { joinTable } from '@/@shared/table/connection';
import type { WorkshopBoard } from '@/server/battlemap';
import type { EntryRow } from '@/server/session';
import {
  getWorkshopBoardAction,
  placeTokenAction,
  removeTokenAction,
  resetFogAction,
  revealRoomsAroundAction,
  revealTilesAction,
  saveTerrainAction,
  setBattleMapVisibilityAction,
  updateTokenAction,
} from '../../battlemap-actions';
import { BoardCanvas, tileAt, type Palette } from '../session/BoardCanvas';
import { WorkshopPanel } from './WorkshopPanel';
import { WorkshopRail } from './WorkshopRail';
import { WorkshopStage } from './WorkshopStage';
import {
  DEFAULT_SETTINGS,
  roomDims,
  TOOLS,
  type Selection,
  type Settings,
  type WorkshopTool,
} from './workshop-state';

/** Debounce on terrain writes. Painting is a stream; the save is a document. */
const SAVE_MS = 600;
const HISTORY = 60;

const TOOL_GLYPH: Record<WorkshopTool, Parameters<typeof Glyph>[0]['name']> = {
  select: 'select',
  rooms: 'room',
  walls: 'wall',
  floor: 'brush',
  height: 'hills',
  scatter: 'tree',
  stamps: 'stamp',
  things: 'chest',
  light: 'candle',
  fog: 'fog',
};

/** The fragment a stamp puts down, turned and flipped as the panel says. */
function stampFragment(stamp: Stamp, turns: number, flip: boolean): Fragment {
  let f = stamp.fragment;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) f = rotateFragment(f);
  if (flip) f = flipFragment(f);
  return f;
}

/** Preview cells for a stamp, turned the same way. Letters, not colours. */
function stampPreview(stamp: Stamp, turns: number, flip: boolean) {
  let w = stamp.fragment.w;
  let h = stamp.fragment.h;
  let cells = stamp.preview.slice();
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    const out: string[] = new Array(w * h).fill(' ');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = h - 1 - y;
        const ny = x;
        out[ny * h + nx] = cells[y * w + x];
      }
    }
    cells = out;
    [w, h] = [h, w];
  }
  if (flip) {
    const out: string[] = new Array(w * h).fill(' ');
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) out[y * w + (w - 1 - x)] = cells[y * w + x];
    cells = out;
  }
  return { w, h, cells };
}

export function Workshop({
  campaignId,
  campaignName,
  mapId,
}: {
  campaignId: string;
  campaignName: string;
  mapId: string;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [bench, setBench] = useState<WorkshopBoard | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The document, and its past and future. Edits land here; a debounced
   * save writes the whole board; the next read from the server is taken
   * only while nothing is pending, or a stroke in progress would be
   * snapped back by its own echo.
   */
  const [doc, setDocState] = useState<BoardDoc | null>(null);
  const [past, setPast] = useState<BoardDoc[]>([]);
  const [future, setFuture] = useState<BoardDoc[]>([]);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'pending' | null>(
    null
  );
  const strokeStart = useRef<BoardDoc | null>(null);

  const load = useCallback(async () => {
    const b = await getWorkshopBoardAction(mapId);
    if (!b) {
      setMissing(true);
      return;
    }
    setBench(b);
    if (!dirty.current) setDocState(b.terrain);
  }, [mapId]);
  useEffect(() => {
    load();
  }, [load]);
  // The table's stream: a change anywhere — a token moved on the screen,
  // a floor painted in another tab — re-reads the bench.
  useEffect(
    () =>
      joinTable(campaignId, frame => {
        if (frame.kind === 'state' || frame.kind === 'resync') load();
      }),
    [campaignId, load]
  );

  const scheduleSave = useCallback(
    (next: BoardDoc) => {
      dirty.current = true;
      setSaved('pending');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        saveTimer.current = null;
        setSaved('saving');
        const res = await saveTerrainAction(mapId, next);
        dirty.current = false;
        if (!res.ok) {
          setError(res.error);
          setSaved(null);
        } else {
          setSaved('saved');
        }
        await load();
      }, SAVE_MS);
    },
    [mapId, load]
  );
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  /** One edit: the document before goes on the stack. */
  const commit = useCallback(
    (next: BoardDoc, opts: { stroke?: boolean } = {}) => {
      setDocState(prev => {
        if (prev && !opts.stroke) {
          setPast(p => [...p.slice(-(HISTORY - 1)), prev]);
          setFuture([]);
        }
        return next;
      });
      scheduleSave(next);
    },
    [scheduleSave]
  );
  const beginStroke = useCallback(() => {
    strokeStart.current = doc;
  }, [doc]);
  const endStroke = useCallback(() => {
    const before = strokeStart.current;
    strokeStart.current = null;
    if (before && before !== doc) {
      setPast(p => [...p.slice(-(HISTORY - 1)), before]);
      setFuture([]);
    }
  }, [doc]);
  const undo = useCallback(() => {
    if (past.length === 0 || !doc) return;
    const prev = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [doc, ...f]);
    setDocState(prev);
    scheduleSave(prev);
  }, [past, doc, scheduleSave]);
  const redo = useCallback(() => {
    if (future.length === 0 || !doc) return;
    const next = future[0];
    setFuture(f => f.slice(1));
    setPast(p => [...p, doc]);
    setDocState(next);
    scheduleSave(next);
  }, [future, doc, scheduleSave]);

  /* --- the floor in front ---------------------------------------------- */

  const [levelId, setLevelId] = useState<string | null>(null);
  const terrain: LevelDoc | null = doc ? levelOf(doc, levelId) : null;
  const levelIdx =
    doc && terrain ? doc.levels.findIndex(l => l.id === terrain.id) : -1;
  const [onion, setOnion] = useState(true);
  const [stood, setStood] = useState(false);
  const tokens = useMemo(() => bench?.tokens ?? [], [bench]);
  const here = useMemo(
    () => tokens.filter(t => t.level === terrain?.id),
    [tokens, terrain?.id]
  );
  const entriesById = useMemo(() => {
    // The bench carries each token's name and side; the canvas reads them
    // off an entry map the way the screen does, so one row shape serves.
    const m = new Map<string, EntryRow>();
    for (const t of tokens) {
      if (!t.entryId) continue;
      m.set(t.entryId, {
        id: t.entryId,
        label: t.label,
        side: t.side ?? 'other',
      } as EntryRow);
    }
    return m;
  }, [tokens]);
  useEffect(() => {
    if (!doc || !terrain) return;
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.key === 'PageUp' || ev.key === 'PageDown') {
        const next = doc.levels[levelIdx + (ev.key === 'PageUp' ? 1 : -1)];
        if (next) {
          ev.preventDefault();
          setLevelId(next.id);
        }
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, terrain, levelIdx, undo, redo]);

  /* --- tools ----------------------------------------------------------- */

  const [tool, setTool] = useState<WorkshopTool>('rooms');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const set = useCallback(
    (patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch })),
    []
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    side: 'n' | 'e' | 's' | 'w' | null;
  } | null>(null);
  const [marquee, setMarquee] = useState<{ from: Tile; to: Tile } | null>(null);
  const [wallDrag, setWallDrag] = useState<{
    from: { x: number; y: number; side: 'n' | 'e' | 's' | 'w' };
    to: Tile;
  } | null>(null);
  const [painting, setPainting] = useState(false);
  const gathered = useRef(new Set<number>());
  const [gatheredCount, setGatheredCount] = useState(0);
  /** The room just drawn, waiting for a name. */
  const [naming, setNaming] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    setMarquee(null);
    setWallDrag(null);
    setNaming(null);
    if (tool !== 'select') setSelection(null);
  }, [tool]);

  // Stamps turn with R and mirror with F.
  useEffect(() => {
    if (tool !== 'stamps') return;
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.key === 'r' || ev.key === 'R')
        set({ stampTurns: (settings.stampTurns + 1) % 4 });
      if (ev.key === 'f' || ev.key === 'F')
        set({ stampFlip: !settings.stampFlip });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, settings.stampTurns, settings.stampFlip, set]);

  const stamp = findStamp(settings.stamp) ?? null;
  const stampFrag = useMemo(
    () =>
      stamp
        ? stampFragment(stamp, settings.stampTurns, settings.stampFlip)
        : null,
    [stamp, settings.stampTurns, settings.stampFlip]
  );

  /** Write one floor. */
  const putLevel = useCallback(
    (next: LevelDoc | ReturnType<typeof paintTiles>, stroke = false) => {
      if (!doc || !terrain) return;
      commit(
        withLevel(doc, {
          ...(next as LevelDoc),
          id: terrain.id,
          name: terrain.name,
          feet: terrain.feet,
          ...(terrain.seen ? { seen: terrain.seen } : {}),
        }),
        { stroke }
      );
    },
    [doc, terrain, commit]
  );

  const brushed = (at: Tile) =>
    terrain ? brushTiles(terrain, at, settings.brush) : [];

  /** A brush tool's touch at a tile, mid-stroke. */
  const brushAt = useCallback(
    (at: Tile) => {
      if (!terrain) return;
      const tiles = brushTiles(terrain, at, settings.brush);
      if (tool === 'floor' && settings.paintMode === 'brush') {
        if (tiles.every(i => terrain.material[i] === settings.mat)) return;
        putLevel(paintTiles(terrain, tiles, settings.mat), true);
      } else if (tool === 'height') {
        const by =
          settings.heightMode === 'lower' ? -settings.step : settings.step;
        putLevel(
          settings.heightMode === 'set'
            ? setHeight(terrain, tiles, settings.step)
            : raiseTiles(terrain, tiles, by),
          true
        );
      } else if (tool === 'scatter' || tool === 'fog') {
        let added = 0;
        for (const i of tiles) {
          if (!gathered.current.has(i)) {
            gathered.current.add(i);
            added += 1;
          }
        }
        if (added) setGatheredCount(gathered.current.size);
      }
    },
    [terrain, tool, settings, putLevel]
  );

  /** Where a stamp's top-left lands for a tap on a tile. */
  const stampAnchor = useCallback(
    (at: Tile): Tile =>
      stampFrag
        ? {
            x: at.x - Math.floor((stampFrag.w - 1) / 2),
            y: at.y - Math.floor((stampFrag.h - 1) / 2),
          }
        : at,
    [stampFrag]
  );

  /** Put a stamp down, with its stairs linked and its floors built. */
  const placeStamp = (at: Tile) => {
    if (!doc || !terrain || !stamp || !stampFrag) return;
    const anchor = stampAnchor(at);
    let next: BoardDoc = withLevel(doc, {
      ...pasteFragment(terrain, stampFrag, anchor),
      id: terrain.id,
      name: terrain.name,
      feet: terrain.feet,
      ...(terrain.seen ? { seen: terrain.seen } : {}),
    } as LevelDoc);
    if (stampFrag.link) {
      const lk = stampFrag.link;
      const box = {
        x: lk.x + anchor.x,
        y: lk.y + anchor.y,
        w: lk.w,
        h: lk.h,
      };
      // A tower stands through its floors: the ones it needs that are not
      // there yet are built above, each the tower's own shell.
      let ids = [terrain.id];
      const wanted = stamp.floors ?? 2;
      let top = levelOf(next, terrain.id);
      for (let n = 1; n < wanted; n++) {
        const above = next.levels.find(l => l.feet > top.feet);
        if (above) {
          top = above;
        } else if (stamp.floors) {
          const made = newLevelFrom(next, top, {
            name:
              n === 1
                ? 'Upper floor'
                : n === 2
                  ? 'Top floor'
                  : `Floor ${n + 1}`,
            feet: top.feet + 10,
            ambient: top.ambient,
            start: 'void',
          });
          // The tower's shell on the new floor, and its own stair.
          const shell = pasteFragment(made, stampFrag, anchor);
          next = {
            ...next,
            levels: [...next.levels, { ...made, ...shell, id: made.id }].sort(
              (a, b) => a.feet - b.feet
            ),
          };
          top = levelOf(next, made.id);
        } else {
          break;
        }
        ids.push(top.id);
      }
      if (ids.length === 1) {
        // No floor above: the stair goes down instead, if there is a below.
        const below = [...next.levels]
          .reverse()
          .find(l => l.feet < terrain.feet);
        if (below) ids = [below.id, terrain.id];
      }
      const links: LevelLink[] = [];
      for (let i = 0; i + 1 < ids.length; i++) {
        links.push({
          id: shortId(),
          kind: lk.kind,
          ...box,
          from: ids[i],
          to: ids[i + 1],
        });
      }
      next = { ...next, links: [...next.links, ...links] };
    }
    commit(next);
  };

  const placeRoom = (a: Tile, b: Tile) => {
    if (!terrain) return;
    let next = roomEdits(terrain, a, b, settings.roomMat, {
      door: settings.roomDoor,
      merge: settings.roomMerge,
    });
    const box = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x) + 1,
      h: Math.abs(b.y - a.y) + 1,
    };
    if (settings.roomName) {
      const n = (next.rooms?.length ?? 0) + 1;
      next = nameRoom(next, { ...box, name: `Room ${n}` });
      setNaming(box);
    }
    putLevel(next);
  };

  /* --- things (rows, not terrain) ---------------------------------------- */

  const placeThing = async (at: Tile) => {
    if (!bench || !terrain) return;
    const res = await placeTokenAction(bench.id, {
      x: at.x,
      y: at.y,
      level: terrain.id,
      label: settings.thingLabel.trim() || 'Something',
      visibility: 'shared',
      state: settings.thingState,
      lockDc: settings.thingState === 'locked' ? settings.thingLockDc : null,
      hpMax: settings.thingHp,
    });
    if (!res.ok) setError(res.error);
    else {
      setSelection({ kind: 'token', id: res.data.id });
      setTool('select');
    }
    await load();
  };

  /* --- fog ------------------------------------------------------------- */

  const flushFog = async () => {
    if (!bench || !terrain || gathered.current.size === 0) return;
    const indices = [...gathered.current];
    gathered.current.clear();
    setGatheredCount(0);
    const res = await revealTilesAction(bench.id, indices, terrain.id);
    if (!res.ok) setError(res.error);
    await load();
  };

  /* --- pointer --------------------------------------------------------- */

  const at = (ev: ReactPointerEvent<HTMLCanvasElement>) =>
    canvasRef.current && terrain
      ? tileAt(canvasRef.current, terrain, ev)
      : null;

  const onPointerDown = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const t = at(ev);
    if (!t || !doc || !terrain) return;
    setError(null);
    switch (tool) {
      case 'select': {
        const hit = here.find(
          k =>
            t.x >= k.x &&
            t.x < k.x + k.footprint &&
            t.y >= k.y &&
            t.y < k.y + k.footprint
        );
        if (hit) {
          setSelection({ kind: 'token', id: hit.id });
          return;
        }
        const i = t.y * terrain.w + t.x;
        const stair = doc.links.find(
          l =>
            (l.from === terrain.id || l.to === terrain.id) &&
            linkTiles(doc, l).includes(i)
        );
        if (stair) {
          setSelection({ kind: 'link', id: stair.id });
          return;
        }
        setSelection(null);
        setMarquee({ from: t, to: t });
        return;
      }
      case 'rooms': {
        const dims = roomDims(settings.roomSize);
        if (dims) {
          placeRoom(t, {
            x: Math.min(terrain.w - 1, t.x + dims[0] - 1),
            y: Math.min(terrain.h - 1, t.y + dims[1] - 1),
          });
          return;
        }
        setMarquee({ from: t, to: t });
        return;
      }
      case 'walls': {
        if (settings.wallMode === 'edge') {
          if (t.side)
            putLevel(setWall(terrain, t.x, t.y, t.side, settings.wallKind));
          return;
        }
        if (settings.wallMode === 'line') {
          if (t.side)
            setWallDrag({ from: { x: t.x, y: t.y, side: t.side }, to: t });
          return;
        }
        setMarquee({ from: t, to: t });
        return;
      }
      case 'floor': {
        if (settings.paintMode === 'fill') {
          if (terrain.material[t.y * terrain.w + t.x] === settings.mat) return;
          putLevel(fillFrom(terrain, t, settings.mat));
          return;
        }
        if (settings.paintMode === 'box') {
          setMarquee({ from: t, to: t });
          return;
        }
        beginStroke();
        setPainting(true);
        brushAt(t);
        return;
      }
      case 'height':
        beginStroke();
        setPainting(true);
        brushAt(t);
        return;
      case 'scatter':
      case 'fog':
        gathered.current.clear();
        setGatheredCount(0);
        setPainting(true);
        brushAt(t);
        return;
      case 'stamps':
        placeStamp(t);
        return;
      case 'things':
        void placeThing(t);
        return;
      case 'light':
        putLevel(toggleLight(terrain, t.x, t.y, settings.lightReach));
        return;
    }
  };

  const onPointerMove = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const t = at(ev);
    setHover(t);
    if (!t) return;
    if (marquee) setMarquee({ ...marquee, to: t });
    if (wallDrag) setWallDrag({ ...wallDrag, to: t });
    if (painting) brushAt(t);
  };

  const onPointerUp = () => {
    if (!doc || !terrain) return;
    if (marquee) {
      const { from, to } = marquee;
      setMarquee(null);
      switch (tool) {
        case 'select':
          setSelection({ kind: 'box', a: from, b: to });
          break;
        case 'rooms':
          placeRoom(from, to);
          break;
        case 'walls':
          if (settings.wallMode === 'box') {
            putLevel(wallOutline(terrain, from, to, settings.wallKind));
          } else if (settings.wallMode === 'erase') {
            putLevel(knockDown(terrain, rectTiles(terrain, from, to)));
          }
          break;
        case 'floor':
          putLevel(
            paintTiles(terrain, rectTiles(terrain, from, to), settings.mat)
          );
          break;
      }
    }
    if (wallDrag) {
      putLevel(wallRun(terrain, wallDrag.from, wallDrag.to, settings.wallKind));
      setWallDrag(null);
    }
    if (painting) {
      setPainting(false);
      if (tool === 'floor' || tool === 'height') endStroke();
      if (tool === 'scatter') {
        const tiles = [...gathered.current];
        gathered.current.clear();
        setGatheredCount(0);
        putLevel(
          scatter(
            terrain,
            tiles,
            settings.scatterKind,
            settings.density,
            {
              blocks: settings.scatterBlocks,
              vary: settings.scatterVary,
              avoid: settings.scatterAvoid,
            },
            seeded(Date.now())
          )
        );
      }
      if (tool === 'fog') void flushFog();
    }
  };

  /* --- the select tool's actions ------------------------------------------ */

  const box = useMemo(
    () =>
      selection?.kind === 'box'
        ? {
            x: Math.min(selection.a.x, selection.b.x),
            y: Math.min(selection.a.y, selection.b.y),
            w: Math.abs(selection.b.x - selection.a.x) + 1,
            h: Math.abs(selection.b.y - selection.a.y) + 1,
          }
        : null,
    [selection]
  );
  const copyToFloor = (targetId: string, move: boolean) => {
    if (!doc || !terrain || selection?.kind !== 'box') return;
    const frag = cutRegion(terrain, selection.a, selection.b);
    const target = levelOf(doc, targetId);
    let next = withLevel(doc, {
      ...pasteFragment(target, frag, { x: box!.x, y: box!.y }),
      id: target.id,
      name: target.name,
      feet: target.feet,
      ...(target.seen ? { seen: target.seen } : {}),
    } as LevelDoc);
    if (move) {
      const cleared = clearRegion(
        levelOf(next, terrain.id),
        selection.a,
        selection.b
      );
      next = withLevel(next, {
        ...cleared,
        id: terrain.id,
        name: terrain.name,
        feet: terrain.feet,
      } as LevelDoc);
    }
    commit(next);
    if (move) {
      setLevelId(target.id);
    }
  };
  const turnSelection = () => {
    if (!terrain || selection?.kind !== 'box' || !box) return;
    const frag = rotateFragment(cutRegion(terrain, selection.a, selection.b));
    const cleared = clearRegion(terrain, selection.a, selection.b);
    putLevel(pasteFragment(cleared, frag, { x: box.x, y: box.y }));
    setSelection({
      kind: 'box',
      a: { x: box.x, y: box.y },
      b: { x: box.x + frag.w - 1, y: box.y + frag.h - 1 },
    });
  };
  const removeSelection = async () => {
    if (!doc || !terrain || !selection) return;
    if (selection.kind === 'box') {
      putLevel(clearRegion(terrain, selection.a, selection.b));
    } else if (selection.kind === 'link') {
      commit({ ...doc, links: doc.links.filter(l => l.id !== selection.id) });
    } else if (selection.kind === 'token') {
      const res = await removeTokenAction(selection.id);
      if (!res.ok) setError(res.error);
      await load();
    }
    setSelection(null);
  };
  const saveAsStamp = () => {
    if (!terrain || selection?.kind !== 'box') return;
    const frag = cutRegion(terrain, selection.a, selection.b);
    try {
      const key = `hero-nexus.workshop.stamps.${campaignId}`;
      const mine = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
      mine.push({
        name: `Stamp ${mine.length + 1}`,
        at: Date.now(),
        fragment: frag,
      });
      localStorage.setItem(key, JSON.stringify(mine.slice(-20)));
      setError(null);
      setSaved(s => s);
    } catch {
      setError('This browser has nowhere to keep a stamp.');
    }
  };

  /* --- the board's chrome ------------------------------------------------- */

  const [zoom, setZoom] = useState<number | null>(null);
  const [fitPx, setFitPx] = useState(24);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !terrain) return;
    const measure = () => {
      const w = el.clientWidth - 52;
      const h = el.clientHeight - 130;
      setFitPx(Math.max(6, Math.floor(Math.min(w / terrain.w, h / terrain.h))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [terrain?.w, terrain?.h, terrain]);
  const px = zoom ?? fitPx;

  const portraitUrls = useMemo(
    () => tokens.map(t => t.imageUrl).filter((u): u is string => !!u),
    [tokens]
  );
  const faces = usePortraits(portraitUrls);
  const imageUrlFor = useCallback(
    (imageId: string) => `/api/campaigns/${campaignId}/images/${imageId}`,
    [campaignId]
  );
  const faceFor = useCallback(
    (_entry: EntryRow | undefined, token?: { imageUrl: string | null }) =>
      token?.imageUrl ? (faces.get(token.imageUrl) ?? null) : null,
    [faces]
  );

  /** The tool's ghost on the board: a room's box, a stamp's cells, a tag. */
  const extras = useCallback(
    (ctx: CanvasRenderingContext2D, size: number, p: Palette) => {
      if (!terrain) return;
      const tag = (text: string, x: number, y: number) => {
        ctx.font = `600 ${Math.max(10, size * 0.4)}px Inter, system-ui, sans-serif`;
        const tw = ctx.measureText(text).width + 12;
        const th = Math.max(16, size * 0.6);
        const lx = Math.max(2, Math.min(terrain.w * size - tw - 2, x));
        const ly = Math.max(2, y - th - 4);
        ctx.fillStyle = p.gold;
        ctx.fillRect(lx, ly, tw, th);
        ctx.fillStyle = dark ? '#16130f' : '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, lx + 6, ly + th / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
      };
      const ghostBox = (
        x: number,
        y: number,
        w: number,
        h: number,
        round = false
      ) => {
        ctx.fillStyle = p.gold;
        ctx.globalAlpha = 0.12;
        ctx.fillRect(x * size, y * size, w * size, h * size);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        if (round) {
          ctx.beginPath();
          ctx.ellipse(
            (x + w / 2) * size,
            (y + h / 2) * size,
            (w * size) / 2,
            (h * size) / 2,
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        } else {
          ctx.strokeRect(
            x * size + 1,
            y * size + 1,
            w * size - 2,
            h * size - 2
          );
        }
        ctx.setLineDash([]);
      };
      // The selection, when it is a box.
      if (box) {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          box.x * size - 2,
          box.y * size - 2,
          box.w * size + 4,
          box.h * size + 4
        );
        ctx.strokeStyle = p.gold;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 6;
        ctx.strokeRect(
          box.x * size - 5,
          box.y * size - 5,
          box.w * size + 10,
          box.h * size + 10
        );
        ctx.globalAlpha = 1;
      }
      if (!hover || marquee) {
        if (marquee && tool !== 'select') {
          const w = Math.abs(marquee.to.x - marquee.from.x) + 1;
          const h = Math.abs(marquee.to.y - marquee.from.y) + 1;
          const x = Math.min(marquee.from.x, marquee.to.x);
          const y = Math.min(marquee.from.y, marquee.to.y);
          tag(
            `${w} × ${h} · ${w * TILE_FEET} × ${h * TILE_FEET} ft`,
            x * size,
            y * size
          );
        }
        if (wallDrag) {
          const { from, to } = wallDrag;
          const horiz = from.side === 'n' || from.side === 's';
          const x0 = horiz ? Math.min(from.x, to.x) : from.x;
          const x1 = horiz ? Math.max(from.x, to.x) + 1 : from.x;
          const y0 = horiz ? from.y : Math.min(from.y, to.y);
          const y1 = horiz ? from.y : Math.max(from.y, to.y) + 1;
          const ex = horiz ? 0 : from.side === 'e' ? 1 : 0;
          const ey = horiz ? (from.side === 's' ? 1 : 0) : 0;
          ctx.strokeStyle = p.gold;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo((x0 + ex) * size, (y0 + ey) * size);
          ctx.lineTo((x1 + ex) * size, (y1 + ey) * size);
          ctx.stroke();
          const n = horiz ? x1 - x0 : y1 - y0;
          tag(
            `${n} tiles · ${n * TILE_FEET} ft of ${settings.wallKind === 'solid' ? 'wall' : settings.wallKind}`,
            x0 * size,
            y0 * size
          );
        }
        return;
      }
      if (tool === 'rooms') {
        const dims = roomDims(settings.roomSize);
        if (dims) {
          ghostBox(hover.x, hover.y, dims[0], dims[1]);
          tag(
            `${dims[0]} × ${dims[1]} · ${dims[0] * TILE_FEET} × ${dims[1] * TILE_FEET} ft`,
            hover.x * size,
            hover.y * size
          );
        }
      } else if (tool === 'stamps' && stamp && stampFrag) {
        const a = stampAnchor(hover);
        const pv = stampPreview(stamp, settings.stampTurns, settings.stampFlip);
        for (let y = 0; y < pv.h; y++) {
          for (let x = 0; x < pv.w; x++) {
            const ch = pv.cells[y * pv.w + x];
            if (ch === ' ') continue;
            ctx.fillStyle = CELL[ch] ?? p.gold;
            ctx.globalAlpha = 0.6;
            if (ch === 'T') {
              ctx.beginPath();
              ctx.arc(
                (a.x + x + 0.5) * size,
                (a.y + y + 0.5) * size,
                size * 0.4,
                0,
                Math.PI * 2
              );
              ctx.fill();
            } else {
              ctx.fillRect(
                (a.x + x) * size + 1,
                (a.y + y) * size + 1,
                size - 2,
                size - 2
              );
            }
            ctx.globalAlpha = 1;
          }
        }
        ghostBox(a.x, a.y, pv.w, pv.h);
        tag(`${stamp.name} · tap to place`, a.x * size, a.y * size);
      } else if (
        tool === 'scatter' ||
        tool === 'fog' ||
        (tool === 'floor' && settings.paintMode === 'brush') ||
        tool === 'height'
      ) {
        const r = settings.brush - 1;
        const n = settings.brush * 2 - 1;
        ghostBox(hover.x - r, hover.y - r, n, n, tool === 'scatter');
        const what =
          tool === 'scatter'
            ? `${settings.density} ${settings.scatterKind}s`
            : tool === 'fog'
              ? 'reveal'
              : tool === 'height'
                ? settings.heightMode === 'lower'
                  ? `−${settings.step} ft`
                  : settings.heightMode === 'set'
                    ? `set ${settings.step} ft`
                    : `+${settings.step} ft`
                : (MATERIALS[settings.mat]?.name ?? '');
        tag(
          `${n} × ${n} · ${what}`,
          (hover.x - r) * size,
          (hover.y - r) * size
        );
        if (tool === 'scatter' && gathered.current.size > 0) {
          ctx.fillStyle = p.success;
          ctx.globalAlpha = 0.18;
          for (const i of gathered.current) {
            ctx.fillRect(
              (i % terrain.w) * size,
              Math.floor(i / terrain.w) * size,
              size,
              size
            );
          }
          ctx.globalAlpha = 1;
        }
      } else if (tool === 'light') {
        ghostBox(hover.x, hover.y, 1, 1);
        tag(`${settings.lightReach} ft`, hover.x * size, hover.y * size);
      } else if (tool === 'things') {
        ghostBox(hover.x, hover.y, 1, 1);
        tag(
          settings.thingLabel.trim() || 'Something',
          hover.x * size,
          hover.y * size
        );
      }
    },
    [
      terrain,
      hover,
      marquee,
      wallDrag,
      tool,
      settings,
      stamp,
      stampFrag,
      stampAnchor,
      box,
      dark,
    ]
  );

  /* --- the level's line ------------------------------------------------- */

  const levelLine = (() => {
    if (!terrain) return '';
    const bits = [feetLabel(terrain.feet)];
    const rooms = terrain.rooms?.length ?? 0;
    bits.push(`${rooms} ${rooms === 1 ? 'room' : 'rooms'}`);
    const party = here.filter(t => t.side === 'party').length;
    const foes = here.filter(t => t.side === 'foe').length;
    if (party) bits.push('the party is here');
    if (foes) bits.push(`${foes} ${foes === 1 ? 'foe' : 'foes'} waiting`);
    return bits.join(' · ');
  })();

  const statusTool = (() => {
    switch (tool) {
      case 'rooms':
        return `Rooms · ${settings.roomSize === 'drag' ? 'drag' : settings.roomSize}`;
      case 'walls':
        return `Walls · ${settings.wallMode === 'edge' ? 'one edge' : settings.wallMode === 'line' ? 'a run' : settings.wallMode === 'box' ? 'outline' : 'knock down'}`;
      case 'floor':
        return `Floor · ${settings.paintMode === 'brush' ? `${settings.brush * 2 - 1}×${settings.brush * 2 - 1}` : settings.paintMode}`;
      case 'height':
        return `Height · ${settings.brush * 2 - 1}×${settings.brush * 2 - 1}`;
      case 'scatter':
        return `Scatter · ${settings.brush * 2 - 1}×${settings.brush * 2 - 1}`;
      case 'stamps':
        return `Stamp · ${stamp?.name ?? '—'}`;
      case 'fog':
        return `Fog · ${settings.brush * 2 - 1}×${settings.brush * 2 - 1}`;
      default:
        return TOOLS.find(t => t.id === tool)?.name ?? '';
    }
  })();

  /* --- render ------------------------------------------------------------ */

  if (missing) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <p className="text-sm text-ink-muted">That board is gone.</p>
      </div>
    );
  }
  if (!bench || !doc || !terrain) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <DiceSpinner label="Clearing the bench…" />
      </div>
    );
  }

  const spec = TOOLS.find(t => t.id === tool)!;
  const above = doc.levels[levelIdx + 1];
  const below = doc.levels[levelIdx - 1];
  const selectedLink =
    selection?.kind === 'link'
      ? (doc.links.find(l => l.id === selection.id) ?? null)
      : null;
  const selectedToken =
    selection?.kind === 'token'
      ? (tokens.find(t => t.id === selection.id) ?? null)
      : null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg text-ink">
      {/* Top bar: one row of chrome, the way the screen has one. */}
      <header className="flex h-[60px] shrink-0 items-center gap-5 border-b border-line bg-surface px-5">
        <Link
          href={`/campaigns/${campaignId}/screen`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink"
        >
          <Glyph name="back" size={16} />
          <span>Back to the table</span>
        </Link>
        <span className="h-7 w-px bg-line" />
        <div className="flex flex-col gap-px">
          <Ribbon tone="gold">The workshop</Ribbon>
          <span className="font-display text-[19px] leading-tight text-ink">
            {bench.name || campaignName}
          </span>
        </div>
        <div className="grow" />
        <nav
          aria-label="View"
          className="inline-flex gap-0.5 rounded-lg border border-line bg-surface-2 p-[3px]"
        >
          {(['flat', 'stood'] as const).map(v => {
            const on = stood === (v === 'stood');
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => setStood(v === 'stood')}
                className={`rounded-md px-3.5 py-1.5 text-[13px] transition-colors ${
                  on
                    ? 'bg-gold font-semibold text-bg'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {v === 'flat' ? 'Flat board' : 'Stand it up'}
              </button>
            );
          })}
        </nav>
        <div className="grow" />
        <div className="flex gap-1">
          <Button
            isIconOnly
            size="sm"
            variant="bordered"
            aria-label="Undo"
            isDisabled={past.length === 0}
            onPress={undo}
          >
            <Glyph name="undo" size={18} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="bordered"
            aria-label="Redo"
            isDisabled={future.length === 0}
            onPress={redo}
          >
            <Glyph name="redo" size={18} />
          </Button>
        </div>
        <span className="text-xs text-ink-muted">
          {saved === 'saving'
            ? 'Saving…'
            : saved === 'pending'
              ? 'Unsaved changes'
              : saved === 'saved'
                ? 'Saved a moment ago'
                : 'Nothing changed yet'}
        </span>
        {error && <span className="text-xs text-danger">{error}</span>}
        <Button
          size="sm"
          color={bench.visibility === 'shared' ? 'default' : 'primary'}
          variant={bench.visibility === 'shared' ? 'flat' : 'solid'}
          onPress={async () => {
            const res = await setBattleMapVisibilityAction(
              bench.id,
              bench.visibility === 'shared' ? 'dm' : 'shared'
            );
            if (!res.ok) setError(res.error);
            await load();
          }}
        >
          {bench.visibility === 'shared' ? 'Take it back' : 'Show the party'}
        </Button>
      </header>

      {stood ? (
        <WorkshopStage
          campaignId={campaignId}
          doc={doc}
          levelId={terrain.id}
          onLevel={setLevelId}
          tokens={tokens}
          entriesById={entriesById}
          faces={faces}
          imageUrlFor={imageUrlFor}
          dark={dark}
          onFlat={() => setStood(false)}
        />
      ) : (
        <div className="flex min-h-0 grow">
          {/* Tool rail */}
          <nav
            aria-label="Tools"
            className="flex w-[72px] shrink-0 flex-col items-center gap-0.5 border-r border-line bg-surface py-2.5"
          >
            {TOOLS.map(t => (
              <div key={t.id} className="contents">
                {t.gap && <span className="my-1.5 h-px w-9 bg-line" />}
                <button
                  type="button"
                  aria-pressed={tool === t.id}
                  onClick={() => setTool(t.id)}
                  className={`flex h-[58px] w-[60px] flex-col items-center justify-center gap-1 rounded-[10px] border text-[10.5px] font-medium transition-colors ${
                    tool === t.id
                      ? 'border-gold/45 bg-gold/15 text-gold-strong dark:text-gold'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  <Glyph name={TOOL_GLYPH[t.id]} size={22} />
                  <span>{t.label}</span>
                </button>
              </div>
            ))}
          </nav>

          {/* Tool panel */}
          <aside className="flex w-[280px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-[18px] py-5">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-[22px] leading-tight">
                {spec.name}
              </h2>
              <Marginalia dash>{spec.hint}</Marginalia>
            </div>
            <WorkshopPanel
              tool={tool}
              settings={settings}
              set={set}
              terrain={terrain}
              doc={doc}
              dark={dark}
              selection={selection}
              box={box}
              above={above ?? null}
              onCopyToFloor={copyToFloor}
              onTurn={turnSelection}
              onRemove={removeSelection}
              onSaveStamp={saveAsStamp}
              onAmbient={a => putLevel({ ...terrain, ambient: a })}
              onRevealRooms={async () => {
                const res = await revealRoomsAroundAction(bench.id, terrain.id);
                if (!res.ok) setError(res.error);
                await load();
              }}
              onHideFloor={async () => {
                const res = await resetFogAction(bench.id, terrain.id);
                if (!res.ok) setError(res.error);
                await load();
              }}
            />
          </aside>

          {/* Board */}
          <main
            ref={stageRef}
            className="relative flex min-w-0 grow flex-col overflow-hidden bg-bg"
            style={{
              backgroundImage: dark
                ? 'radial-gradient(#2a231a 1px, transparent 1px)'
                : 'radial-gradient(#e4dccb 1px, transparent 1px)',
              backgroundSize: '26px 26px',
            }}
          >
            <div className="flex shrink-0 items-center gap-3.5 px-[26px] pt-[18px]">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-label="Floor above"
                  disabled={!above}
                  onClick={() => above && setLevelId(above.id)}
                  className="flex h-[22px] w-7 items-center justify-center rounded-[5px] border border-line bg-surface text-ink-muted disabled:opacity-40"
                >
                  <Glyph name="stairs" size={12} />
                </button>
                <button
                  type="button"
                  aria-label="Floor below"
                  disabled={!below}
                  onClick={() => below && setLevelId(below.id)}
                  className="flex h-[22px] w-7 items-center justify-center rounded-[5px] border border-line bg-surface text-ink-muted disabled:opacity-40"
                >
                  <Glyph name="ladder" size={12} />
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                <h1 className="font-display text-[30px] leading-none">
                  {terrain.name}
                </h1>
                <span className="text-[13px] text-ink-muted">{levelLine}</span>
              </div>
              <div className="grow" />
              {onion && below && (
                <Marginalia>dashed lines are the floor below</Marginalia>
              )}
            </div>
            <div
              ref={wrapRef}
              className="min-h-0 grow overflow-auto px-[26px] pb-16 pt-6"
            >
              <BoardCanvas
                canvasRef={canvasRef}
                wrapRef={wrapRef}
                terrain={terrain}
                doc={doc}
                here={here}
                allTokens={tokens}
                entriesById={entriesById}
                currentEntryIds={new Set()}
                revealed={bench.revealed[terrain.id] ?? []}
                isStaff
                dark={dark}
                zoom={px}
                onion={onion}
                selectedLink={selectedLink?.id ?? null}
                litArea={null}
                pending={tool === 'fog' ? gathered.current : null}
                tick={gatheredCount}
                reach={null}
                jumps={null}
                faces={faces}
                imageUrlFor={imageUrlFor}
                faceFor={faceFor}
                selectedIds={selectedToken ? [selectedToken.id] : []}
                selected={selectedToken?.id ?? null}
                hover={hover}
                hoverShape={
                  tool === 'walls' &&
                  (settings.wallMode === 'edge' || settings.wallMode === 'line')
                    ? 'edge'
                    : null
                }
                marquee={marquee}
                ruler={null}
                diagonals="5-5-5"
                extras={extras}
                className="block cursor-crosshair touch-none rounded-[4px] shadow-[0_0_0_1px_var(--line),0_24px_60px_-20px_rgba(0,0,0,0.8)]"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => {
                  setHover(null);
                  onPointerUp();
                }}
              />
            </div>
            {/* Zoom */}
            <div className="absolute bottom-5 right-[26px] flex items-center gap-0.5 rounded-lg border border-line bg-surface p-[3px]">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => setZoom(Math.max(6, Math.round(px * 0.8)))}
                className="h-8 w-8 rounded-md text-base text-ink hover:bg-surface-2"
              >
                −
              </button>
              <span className="w-12 text-center text-xs tabular-nums text-ink-muted">
                {Math.round((px / fitPx) * 100)}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => setZoom(Math.min(80, Math.round(px * 1.25)))}
                className="h-8 w-8 rounded-md text-base text-ink hover:bg-surface-2"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setZoom(null)}
                className="h-8 rounded-md px-2.5 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                Fit
              </button>
            </div>
          </main>

          {/* Right rail */}
          <WorkshopRail
            campaignId={campaignId}
            bench={bench}
            doc={doc}
            terrain={terrain}
            tokens={tokens}
            onLevel={setLevelId}
            onion={onion}
            onOnion={setOnion}
            onChange={next => commit(next)}
            selectedLink={selectedLink}
            selectedToken={selectedToken}
            box={box}
            onClearSelection={() => setSelection(null)}
            onRemoveSelection={removeSelection}
            onTokenChange={async (id, patch) => {
              const res = await updateTokenAction(id, patch);
              if (!res.ok) setError(res.error);
              await load();
            }}
            onError={setError}
            reload={load}
          />
        </div>
      )}

      {/* Status bar */}
      <footer className="flex h-9 shrink-0 items-center gap-[22px] border-t border-line bg-surface px-5 text-xs tabular-nums text-ink-muted">
        <span className="text-ink">
          {terrain.name} · {feetLabel(terrain.feet)}
        </span>
        <span>{hover ? `Tile ${hover.x}, ${hover.y}` : 'Tile —'}</span>
        <span>{statusTool}</span>
        <span>Snaps to tile edges</span>
        {selectedLink && (
          <span>{linkCostFeet(doc, selectedLink, terrain.id)} ft to climb</span>
        )}
        <div className="grow" />
        <span>Page Up / Page Down changes floor</span>
      </footer>
      {/* A name for the room just drawn, when the flag asks for one. */}
      {naming && (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-gold/40 bg-surface px-3 py-2 shadow-md">
            <span className="text-sm text-ink">Call it</span>
            <Input
              size="sm"
              autoFocus
              aria-label="The room's name"
              placeholder="Great hall"
              className="w-44"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = (e.currentTarget as HTMLInputElement).value.trim();
                  if (v) putLevel(nameRoom(terrain, { ...naming, name: v }));
                  setNaming(null);
                }
                if (e.key === 'Escape') setNaming(null);
              }}
            />
            <Button size="sm" variant="light" onPress={() => setNaming(null)}>
              Later
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
