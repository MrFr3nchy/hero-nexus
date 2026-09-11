'use client';

/**
 * The sand table, in two dimensions.
 *
 * This is the authoring surface and it always exists: it is what a DM paints
 * the room on at 1am, and it is what renders on a phone and on a laptop with a
 * dead GPU. The 3D view (a later phase) is a function of the same document and
 * can be replaced without touching this.
 *
 * Canvas 2D, not SVG. A 60×60 board is 3,600 tiles and the DOM would hate it.
 *
 * What it draws comes off `LiveState.battlemap`, which the server has already
 * fogged for a player — this component never sees a tile the reader may not.
 * Combatant names, hit points and sides come off `LiveState.entries`, read
 * live, because `numberDuplicates` renames "Goblin" to "Goblin 1" when a
 * second one walks in and a cached label would disagree with the tracker.
 *
 * Design language: the board is the artifact (rule 1), and its one animated
 * moment is the active-turn ring (rule 4). Nothing else on it moves.
 */
import { Button, Select, SelectItem, Tooltip } from '@heroui/react';
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
  canStand,
  distanceFeet,
  reachFor,
  wallIndex,
} from '@/@creator/campaign/lib/battlemap';
import {
  edgeKey,
  inBounds,
  MATERIALS,
  MAX_SIDE,
  MIN_SIDE,
  VOID,
  type PropKind,
  type Side,
  type TerrainDoc,
  type WallKind,
} from '@/@shared/battlemap/types';
import {
  BattlefieldScene,
  EmptyState,
  Glyph,
  Marginalia,
  SectionCard,
} from '@/@shared/components/ui';
import type { EntryRow, LiveState } from '@/server/session';
import {
  createBattleMapAction,
  dealEncounterInAction,
  moveTokenAction,
  placeTokenAction,
  removeTokenAction,
  resetFogAction,
  revealFromPartyAction,
  revealTilesAction,
  saveTerrainAction,
  setBattleMapActiveAction,
  setBattleMapVisibilityAction,
  updateTokenAction,
} from '../../battlemap-actions';
import { BattleMap3DLazy } from './BattleMap3DLazy';
import { useDiceTray } from '@/@shared/components/dice';
import { withAdvantage } from '@/@shared/lib/dice';
import { rollAction } from '../../actions';
import { usePortraits } from '@/@shared/battlemap/portraits';

/* --- tools ------------------------------------------------------------- */

type Tool =
  | { kind: 'select' }
  | { kind: 'paint'; material: number }
  | { kind: 'raise'; by: 5 | -5 }
  | { kind: 'wall'; wall: WallKind }
  | { kind: 'erase-wall' }
  | { kind: 'prop'; prop: PropKind; blocks: boolean }
  | { kind: 'light' }
  | { kind: 'reveal' }
  | { kind: 'scenery' };

const PROPS: { kind: PropKind; blocks: boolean; label: string }[] = [
  { kind: 'table', blocks: true, label: 'Table' },
  { kind: 'chest', blocks: false, label: 'Chest' },
  { kind: 'barrel', blocks: true, label: 'Barrel' },
  { kind: 'pillar', blocks: true, label: 'Pillar' },
  { kind: 'tree', blocks: true, label: 'Tree' },
  { kind: 'rubble', blocks: false, label: 'Rubble' },
  { kind: 'altar', blocks: true, label: 'Altar' },
  { kind: 'statue', blocks: true, label: 'Statue' },
];

const WALLS: { kind: WallKind; label: string; height: number }[] = [
  { kind: 'solid', label: 'Wall', height: 10 },
  { kind: 'door', label: 'Door', height: 10 },
  { kind: 'window', label: 'Window', height: 10 },
  { kind: 'rail', label: 'Rail', height: 3 },
];

/** How far a token may be shown to reach. The rules module prices it. */
const DEFAULT_SPEED_FEET = 30;

/** Debounce on terrain writes. Painting is a stream; the save is a document. */
const SAVE_MS = 500;

/* --- drawing helpers --------------------------------------------------- */

interface Palette {
  line: string;
  ink: string;
  inkMuted: string;
  gold: string;
  danger: string;
  success: string;
  warning: string;
  arcane: string;
  surface: string;
  dark: boolean;
}

function readPalette(dark: boolean): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    line: v('--line', dark ? '#33291d' : '#e4dccb'),
    ink: v('--ink', dark ? '#ede7da' : '#2b2620'),
    inkMuted: v('--ink-muted', dark ? '#a89f8d' : '#6b6459'),
    gold: v('--gold', dark ? '#d9b061' : '#b4894a'),
    danger: v('--danger', dark ? '#d9756c' : '#a23b34'),
    success: v('--success', dark ? '#6bbf8a' : '#3f7d55'),
    warning: v('--warning', dark ? '#d6a253' : '#b07d33'),
    arcane: v('--arcane', dark ? '#a988cf' : '#6b4d8a'),
    surface: v('--surface', dark ? '#1e1a14' : '#ffffff'),
    dark,
  };
}

/** The HP ring colour, by the ratio rule `HeroCard` already uses. */
function hpTone(entry: EntryRow | undefined, p: Palette): string | null {
  if (!entry || entry.hpCurrent === null || !entry.hpMax) return null;
  const ratio = entry.hpCurrent / entry.hpMax;
  if (ratio > 0.5) return p.success;
  if (ratio > 0.25) return p.warning;
  return p.danger;
}

function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Which edge of a tile a pointer is nearest, if it is near one at all.
 * Within ~22% of the tile size from an edge counts; the middle is the tile.
 */
function nearestEdge(fx: number, fy: number): Side | null {
  const m = 0.22;
  const d = { n: fy, s: 1 - fy, w: fx, e: 1 - fx };
  const [side, dist] = (Object.entries(d) as [Side, number][]).sort(
    (a, b) => a[1] - b[1]
  )[0];
  return dist < m ? side : null;
}

/* --- the board --------------------------------------------------------- */

export function BattleBoard({
  campaignId,
  state,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const board = state.battlemap;

  const entriesById = useMemo(() => {
    const m = new Map<string, EntryRow>();
    for (const e of state.entries) m.set(e.id, e);
    return m;
  }, [state.entries]);

  /*
   * A local copy of the terrain while the DM is painting. Edits land here
   * first; a debounced save writes the whole document; and the next live read
   * overwrites this with what the server kept. While a save is pending the
   * incoming document is ignored, or the paint stroke in progress would be
   * snapped back to its start by the previous stroke's echo.
   */
  const [terrain, setTerrain] = useState<TerrainDoc | null>(
    board?.terrain ?? null
  );
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!board) {
      setTerrain(null);
      return;
    }
    if (!dirty.current) setTerrain(board.terrain);
  }, [board]);

  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [selected, setSelected] = useState<string | null>(null);
  const tray = useDiceTray();

  /**
   * Roll from the board, as the selected combatant.
   *
   * The dice tray is the app's loudest verb and it is already built, so the
   * board does not grow a second one: the roll goes through `rollAction` like
   * every other, lands in the shared log, announces to the table, and the
   * tray draws the faces the server rolled. `characterId` travels only for a
   * seated character, and the server still checks whose it is.
   */
  const rollFrom = useCallback(
    async (
      token: { entryId: string | null },
      mode: 'flat' | 'advantage' | 'disadvantage'
    ) => {
      const entry = token.entryId ? entriesById.get(token.entryId) : undefined;
      const name = entry?.label ?? 'Somebody';
      // The actor is the character; the label says where it came from. Using
      // the name for both read as "Kessa · Kessa" in the log.
      const label = 'From the board';
      const res = await rollAction(campaignId, {
        notation: mode === 'flat' ? 'd20' : withAdvantage('d20', mode),
        label,
        characterId: entry?.characterId ?? null,
        visibility: 'table',
      });
      if (!res.ok) {
        onError(res.error ?? 'The dice did not land.');
        return;
      }
      await tray.showNotationRoll(res.data, {
        title: name,
        hint: res.data.notation,
      });
    },
    [campaignId, entriesById, onError, tray]
  );
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    side: Side | null;
  } | null>(null);
  const [painting, setPainting] = useState(false);
  /**
   * The reveal brush. Tiles are gathered during the stroke and drawn as
   * pending, then sent **once on pointer-up** — one write per stroke rather
   * than one per pointer event, which is the same trap the handoff names for
   * token drags and was this tool's first shape.
   */
  const [brush, setBrush] = useState<1 | 2 | 3>(1);
  const pendingReveal = useRef(new Set<number>());
  const [pendingCount, setPendingCount] = useState(0);
  const brushAt = useCallback(
    (x: number, y: number) => {
      if (!terrain) return;
      const r = brush - 1;
      let added = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (!inBounds(terrain, tx, ty)) continue;
          const i = ty * terrain.w + tx;
          if (!pendingReveal.current.has(i)) {
            pendingReveal.current.add(i);
            added += 1;
          }
        }
      }
      if (added) setPendingCount(pendingReveal.current.size);
    },
    [terrain, brush]
  );
  const flushReveal = useCallback(async () => {
    if (!board || pendingReveal.current.size === 0) return;
    const indices = [...pendingReveal.current];
    pendingReveal.current.clear();
    setPendingCount(0);
    const res = await revealTilesAction(board.id, indices);
    if (!res.ok) onError(res.error);
    await refresh();
  }, [board, onError, refresh]);
  const [busy, setBusy] = useState(false);
  const [newW, setNewW] = useState('20');
  const [newH, setNewH] = useState('15');
  /**
   * The 3D view is a *view*: the 2D board stays the authoring surface and the
   * thing a phone renders. Off by default so a laptop with a dead GPU is not
   * handed a renderer it did not ask for, and remembered per device.
   */
  const [dimensional, setDimensional] = useState(false);
  useEffect(() => {
    try {
      setDimensional(localStorage.getItem('hero-nexus.sand-table.3d') === '1');
    } catch {
      // No storage: the board it is.
    }
  }, []);
  const toggleDimensional = () => {
    const next = !dimensional;
    setDimensional(next);
    try {
      localStorage.setItem('hero-nexus.sand-table.3d', next ? '1' : '0');
    } catch {
      // Held for this page only.
    }
  };

  // Faces on the board. `character_portraits` was always this feature's token
  // art; the cache is shared with the 3D view so a face loads once.
  const portraitUrls = useMemo(
    () => Object.values(state.portraits ?? {}),
    [state.portraits]
  );
  const faces = usePortraits(portraitUrls);
  const faceFor = useCallback(
    (entry: EntryRow | undefined): HTMLImageElement | null => {
      if (!entry?.characterId) return null;
      const url = state.portraits?.[entry.characterId];
      return url ? (faces.get(url) ?? null) : null;
    },
    [state.portraits, faces]
  );

  const currentEntryId = useMemo(() => {
    if (!state.encounter) return null;
    return state.entries[state.encounter.turnIndex]?.id ?? null;
  }, [state.encounter, state.entries]);

  const selectedToken = board?.tokens.find(t => t.id === selected) ?? null;

  /**
   * Speed off the sheet, for a seated character; the default for a monster
   * dealt in from the bestiary, whose stat block the tracker does not carry.
   * Advice, not a fence: `moveToken` does not enforce distance, because a DM
   * saying "you can't get there this turn" is how that rule is applied at a
   * table, and a fence would put the app between them.
   */
  const speedOf = useCallback(
    (t: { entryId: string | null }): number => {
      const entry = t.entryId ? entriesById.get(t.entryId) : undefined;
      const sheet = entry?.characterId
        ? state.party.find(p => p.characterId === entry.characterId)
        : undefined;
      return sheet?.speed ?? DEFAULT_SPEED_FEET;
    },
    [entriesById, state.party]
  );

  const sideOf = useCallback(
    (t: { entryId: string | null }): string | null =>
      t.entryId ? (entriesById.get(t.entryId)?.side ?? null) : null,
    [entriesById]
  );

  const reach = useMemo(() => {
    if (!terrain || !selectedToken || !board) return null;
    const asReach = (t: (typeof board.tokens)[number]) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      footprint: t.footprint,
      side: sideOf(t),
    });
    return reachFor(
      terrain,
      asReach(selectedToken),
      board.tokens.map(asReach),
      speedOf(selectedToken)
    );
  }, [terrain, selectedToken, board, sideOf, speedOf]);

  /* --- saving ---------------------------------------------------------- */

  const scheduleSave = useCallback(
    (next: TerrainDoc) => {
      if (!board) return;
      dirty.current = true;
      setTerrain(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        saveTimer.current = null;
        const res = await saveTerrainAction(board.id, next);
        dirty.current = false;
        if (!res.ok) onError(res.error);
        await refresh();
      }, SAVE_MS);
    },
    [board, onError, refresh]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  /* --- editing --------------------------------------------------------- */

  const applyTool = useCallback(
    (x: number, y: number, side: Side | null) => {
      if (!terrain || !isStaff) return;
      if (!inBounds(terrain, x, y)) return;
      const i = y * terrain.w + x;
      const next: TerrainDoc = {
        ...terrain,
        elevation: [...terrain.elevation],
        material: [...terrain.material],
        walls: [...terrain.walls],
        props: [...terrain.props],
        lights: [...terrain.lights],
      };

      switch (tool.kind) {
        case 'paint':
          if (next.material[i] === tool.material) return;
          next.material[i] = tool.material;
          break;
        case 'raise':
          next.elevation[i] = Math.max(
            -50,
            Math.min(200, next.elevation[i] + tool.by)
          );
          break;
        case 'wall': {
          if (!side) return;
          const key = edgeKey(x, y, side);
          const spec = WALLS.find(w => w.kind === tool.wall)!;
          next.walls = next.walls.filter(
            w => edgeKey(w.x, w.y, w.side) !== key
          );
          next.walls.push({
            x,
            y,
            side,
            kind: tool.wall,
            height: spec.height,
            ...(tool.wall === 'door' ? { open: false } : {}),
          });
          break;
        }
        case 'erase-wall': {
          if (!side) return;
          const key = edgeKey(x, y, side);
          const before = next.walls.length;
          next.walls = next.walls.filter(
            w => edgeKey(w.x, w.y, w.side) !== key
          );
          if (next.walls.length === before) return;
          break;
        }
        case 'prop': {
          const has = next.props.findIndex(p => p.x === x && p.y === y);
          if (has >= 0) next.props.splice(has, 1);
          else next.props.push({ x, y, kind: tool.prop, blocks: tool.blocks });
          break;
        }
        case 'light': {
          const has = next.lights.findIndex(l => l.x === x && l.y === y);
          if (has >= 0) next.lights.splice(has, 1);
          else next.lights.push({ x, y, radius: 20 });
          break;
        }
        default:
          return;
      }
      scheduleSave(next);
    },
    [terrain, isStaff, tool, scheduleSave]
  );

  const toggleDoor = useCallback(
    (x: number, y: number, side: Side) => {
      if (!terrain || !isStaff) return;
      const key = edgeKey(x, y, side);
      const idx = terrain.walls.findIndex(
        w => edgeKey(w.x, w.y, w.side) === key && w.kind === 'door'
      );
      if (idx < 0) return;
      const walls = [...terrain.walls];
      walls[idx] = { ...walls[idx], open: !walls[idx].open };
      scheduleSave({ ...terrain, walls });
    },
    [terrain, isStaff, scheduleSave]
  );

  /* --- pointer --------------------------------------------------------- */

  const tileAt = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !terrain) return null;
    const rect = canvas.getBoundingClientRect();
    const size = rect.width / terrain.w;
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const x = Math.floor(px / size);
    const y = Math.floor(py / size);
    if (!inBounds(terrain, x, y)) return null;
    const fx = px / size - x;
    const fy = py / size - y;
    return { x, y, side: nearestEdge(fx, fy) };
  };

  const onPointerDown = async (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const at = tileAt(ev);
    if (!at || !board || !terrain) return;

    // Staff with a building tool: paint. Everything else is selection and
    // movement, which players and staff share.
    if (isStaff && tool.kind !== 'select' && tool.kind !== 'scenery') {
      if (tool.kind === 'reveal') {
        setPainting(true);
        brushAt(at.x, at.y);
        return;
      }
      setPainting(true);
      applyTool(at.x, at.y, at.side);
      return;
    }

    if (isStaff && tool.kind === 'scenery') {
      const res = await placeTokenAction(board.id, {
        x: at.x,
        y: at.y,
        label: 'Something',
        visibility: 'shared',
      });
      if (!res.ok) onError(res.error);
      await refresh();
      return;
    }

    // A door is opened by clicking its edge, by anyone at the table — it is
    // the one piece of terrain a fight actually changes.
    if (at.side) {
      const key = edgeKey(at.x, at.y, at.side);
      const door = terrain.walls.find(
        w => edgeKey(w.x, w.y, w.side) === key && w.kind === 'door'
      );
      if (door && isStaff) {
        toggleDoor(at.x, at.y, at.side);
        return;
      }
    }

    const hit = board.tokens.find(
      t =>
        at.x >= t.x &&
        at.x < t.x + t.footprint &&
        at.y >= t.y &&
        at.y < t.y + t.footprint
    );

    if (hit) {
      setSelected(hit.id === selected ? null : hit.id);
      return;
    }

    // An empty tile with a token selected: move it there, if it may be.
    if (selectedToken && selectedToken.mine) {
      const others = board.tokens.filter(t => t.id !== selectedToken.id);
      if (
        !canStand(
          terrain,
          { x: at.x, y: at.y, footprint: selectedToken.footprint },
          others
        )
      ) {
        return;
      }
      setBusy(true);
      const res = await moveTokenAction(selectedToken.id, { x: at.x, y: at.y });
      setBusy(false);
      if (!res.ok) onError(res.error);
      await refresh();
      return;
    }

    setSelected(null);
  };

  const hoverToken = useMemo(() => {
    if (!hover || !board) return null;
    return (
      board.tokens.find(
        t =>
          hover.x >= t.x &&
          hover.x < t.x + t.footprint &&
          hover.y >= t.y &&
          hover.y < t.y + t.footprint
      ) ?? null
    );
  }, [hover, board]);

  const onPointerMove = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const at = tileAt(ev);
    setHover(at);
    if (!painting || !at || !isStaff) return;
    if (tool.kind === 'reveal') {
      brushAt(at.x, at.y);
      return;
    }
    if (tool.kind === 'paint' || tool.kind === 'raise') {
      applyTool(at.x, at.y, at.side);
    }
  };

  const onPointerUp = () => {
    if (painting && tool.kind === 'reveal') flushReveal();
    setPainting(false);
  };

  /* --- drawing --------------------------------------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !terrain || !board) return;

    // Hidden behind the 3D view the wrapper has no width, and a zero-size
    // tile makes every radius below negative — `arc` throws on that and the
    // whole page went down with it. Found in a browser, not by a typecheck.
    if (dimensional) return;
    const p = readPalette(dark);
    const width = wrap.clientWidth;
    const size = Math.floor(width / terrain.w);
    if (size < 2) return;
    const W = size * terrain.w;
    const H = size * terrain.h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Tiles.
    for (let y = 0; y < terrain.h; y++) {
      for (let x = 0; x < terrain.w; x++) {
        const i = y * terrain.w + x;
        const m = MATERIALS[terrain.material[i]] ?? MATERIALS[VOID];
        const px = x * size;
        const py = y * size;
        if (terrain.material[i] === VOID) {
          // Absent, not dark: the fog filter has already removed anything a
          // player may not see, and drawing "unknown" as a shade would leak
          // the shape of a room the server declined to describe.
          continue;
        }
        ctx.fillStyle = dark ? m.swatchDark : m.swatch;
        ctx.fillRect(px, py, size, size);

        // Elevation as a shade, so a ledge reads without a number on it.
        const e = terrain.elevation[i];
        if (e !== 0) {
          ctx.fillStyle = e > 0 ? 'rgba(255,255,255,' : 'rgba(0,0,0,';
          ctx.fillStyle += `${Math.min(0.35, Math.abs(e) / 60)})`;
          ctx.fillRect(px, py, size, size);
        }
        if (isStaff && e !== 0 && size >= 18) {
          ctx.fillStyle = p.inkMuted;
          ctx.font = `${Math.max(8, size * 0.28)}px ui-sans-serif, system-ui`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${e > 0 ? '+' : ''}${e}`, px + size - 2, py + size - 1);
        }
      }
    }

    // Grid.
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= terrain.w; x++) {
      ctx.moveTo(x * size + 0.5, 0);
      ctx.lineTo(x * size + 0.5, H);
    }
    for (let y = 0; y <= terrain.h; y++) {
      ctx.moveTo(0, y * size + 0.5);
      ctx.lineTo(W, y * size + 0.5);
    }
    ctx.stroke();

    // Fog boundary for staff: revealed tiles get a faint gold wash so the DM
    // can see what the party has been shown, and the stroke in progress a
    // brighter one so they can see what they are about to show.
    if (isStaff && board.revealed.length > 0) {
      ctx.fillStyle = p.gold;
      ctx.globalAlpha = 0.12;
      for (const i of board.revealed) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.fillRect(x * size, y * size, size, size);
      }
      ctx.globalAlpha = 1;
    }
    if (isStaff && pendingReveal.current.size > 0) {
      ctx.fillStyle = p.gold;
      ctx.globalAlpha = 0.28;
      for (const i of pendingReveal.current) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.fillRect(x * size, y * size, size, size);
      }
      ctx.globalAlpha = 1;
    }

    // Lights: a warm falloff. Candlelight is the palette; lean into it.
    for (const l of terrain.lights) {
      const cx = (l.x + 0.5) * size;
      const cy = (l.y + 0.5) * size;
      const r = (l.radius / 5) * size;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(217,176,97,0.35)');
      g.addColorStop(1, 'rgba(217,176,97,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = p.gold;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, size * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }

    // Reach, for the selected token: an inset outline per tile rather than a
    // fill, so it reads apart from the revealed wash the DM also sees, which
    // is a fill in the same gold. Two washes on one tile were one wash.
    if (reach) {
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      const inset = Math.max(3, size * 0.14);
      for (const i of reach.keys()) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.strokeRect(
          x * size + inset,
          y * size + inset,
          size - inset * 2,
          size - inset * 2
        );
      }
      ctx.setLineDash([]);
    }

    // Props: drawn, never typed.
    for (const pr of terrain.props) {
      const cx = (pr.x + 0.5) * size;
      const cy = (pr.y + 0.5) * size;
      const s = size * 0.3;
      ctx.strokeStyle = p.inkMuted;
      ctx.fillStyle = p.surface;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      switch (pr.kind) {
        case 'barrel':
        case 'pillar':
          ctx.arc(cx, cy, s, 0, Math.PI * 2);
          break;
        case 'tree':
          ctx.moveTo(cx, cy - s);
          ctx.lineTo(cx + s, cy + s);
          ctx.lineTo(cx - s, cy + s);
          ctx.closePath();
          break;
        case 'statue':
        case 'altar':
          ctx.moveTo(cx, cy - s);
          ctx.lineTo(cx + s, cy);
          ctx.lineTo(cx, cy + s);
          ctx.lineTo(cx - s, cy);
          ctx.closePath();
          break;
        case 'rubble':
          ctx.arc(cx - s * 0.5, cy + s * 0.3, s * 0.4, 0, Math.PI * 2);
          ctx.moveTo(cx + s * 0.6, cy - s * 0.2);
          ctx.arc(cx + s * 0.3, cy - s * 0.2, s * 0.3, 0, Math.PI * 2);
          break;
        default:
          ctx.rect(cx - s, cy - s * 0.7, s * 2, s * 1.4);
      }
      ctx.fill();
      ctx.stroke();
    }

    // Walls on edges. A door reads as a gap with a swing; a window as a thin
    // line; a rail as a dotted one.
    const walls = wallIndex(terrain);
    for (const w of walls.values()) {
      const x0 = w.x * size;
      const y0 = w.y * size;
      let ax = x0,
        ay = y0,
        bx = x0,
        by = y0;
      switch (w.side) {
        case 'n':
          bx = x0 + size;
          break;
        case 's':
          ay = by = y0 + size;
          bx = x0 + size;
          break;
        case 'w':
          by = y0 + size;
          break;
        case 'e':
          ax = bx = x0 + size;
          by = y0 + size;
          break;
      }
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      switch (w.kind) {
        case 'solid':
          ctx.strokeStyle = p.ink;
          ctx.lineWidth = Math.max(3, size * 0.14);
          break;
        case 'door':
          ctx.strokeStyle = w.open ? p.success : p.gold;
          ctx.lineWidth = Math.max(3, size * 0.14);
          if (w.open) ctx.setLineDash([size * 0.15, size * 0.15]);
          break;
        case 'window':
          ctx.strokeStyle = p.arcane;
          ctx.lineWidth = Math.max(2, size * 0.08);
          break;
        case 'rail':
          ctx.strokeStyle = p.inkMuted;
          ctx.lineWidth = Math.max(2, size * 0.08);
          ctx.setLineDash([size * 0.1, size * 0.1]);
          break;
      }
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Tokens.
    for (const t of board.tokens) {
      const entry = t.entryId ? entriesById.get(t.entryId) : undefined;
      const label = entry?.label ?? t.label ?? '';
      const cx = (t.x + t.footprint / 2) * size;
      const cy = (t.y + t.footprint / 2) * size;
      const r = Math.max(1, (size * t.footprint) / 2 - Math.max(3, size * 0.1));

      // Base.
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle =
        entry?.side === 'foe'
          ? p.danger
          : entry?.side === 'party'
            ? p.gold
            : p.inkMuted;
      ctx.globalAlpha = t.visibility === 'dm' ? 0.45 : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;

      // HP ring, by the HeroCard rule. For a foe the server has nulled the
      // numbers for a player, so there is no ring — as the tracker shows a
      // word rather than a number.
      const tone = hpTone(entry, p);
      if (tone) {
        ctx.strokeStyle = tone;
        ctx.lineWidth = Math.max(2, size * 0.08);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // The one animated thing: whose turn it is.
      if (entry && entry.id === currentEntryId) {
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.setLineDash([size * 0.12, size * 0.08]);
        ctx.beginPath();
        ctx.arc(cx, cy, r + Math.max(3, size * 0.12), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Selection.
      if (t.id === selected) {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + Math.max(5, size * 0.18), 0, Math.PI * 2);
        ctx.stroke();
      }

      // The face, clipped to the base, or initials when there is none.
      const face = faceFor(entry);
      if (face) {
        const inner = r - Math.max(2, size * 0.06);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, inner, 0, Math.PI * 2);
        ctx.clip();
        // Cover, not stretch: the shorter side fills the circle.
        const scale = Math.max(
          (inner * 2) / face.naturalWidth,
          (inner * 2) / face.naturalHeight
        );
        const dw = face.naturalWidth * scale;
        const dh = face.naturalHeight * scale;
        ctx.globalAlpha = t.visibility === 'dm' ? 0.5 : 1;
        ctx.drawImage(face, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.globalAlpha = 1;
        ctx.restore();
      } else {
        ctx.fillStyle = p.surface;
        ctx.font = `600 ${Math.max(9, r * 0.8)}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials(label), cx, cy + 1);
      }
    }

    // Hover.
    if (hover && isStaff && tool.kind !== 'select') {
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 2;
      if ((tool.kind === 'wall' || tool.kind === 'erase-wall') && hover.side) {
        const x0 = hover.x * size;
        const y0 = hover.y * size;
        ctx.beginPath();
        switch (hover.side) {
          case 'n':
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + size, y0);
            break;
          case 's':
            ctx.moveTo(x0, y0 + size);
            ctx.lineTo(x0 + size, y0 + size);
            break;
          case 'w':
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0, y0 + size);
            break;
          case 'e':
            ctx.moveTo(x0 + size, y0);
            ctx.lineTo(x0 + size, y0 + size);
            break;
        }
        ctx.stroke();
      } else {
        const r = tool.kind === 'reveal' ? brush - 1 : 0;
        ctx.strokeRect(
          (hover.x - r) * size + 1,
          (hover.y - r) * size + 1,
          size * (2 * r + 1) - 2,
          size * (2 * r + 1) - 2
        );
      }
    }
  }, [
    terrain,
    board,
    dark,
    isStaff,
    entriesById,
    currentEntryId,
    selected,
    reach,
    hover,
    tool,
    faceFor,
    dimensional,
    pendingCount,
    brush,
  ]);

  // Redraw on resize: the canvas is sized off its container.
  const [, bump] = useState(0);
  useEffect(() => {
    const onResize = () => bump(n => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* --- no board -------------------------------------------------------- */

  if (!board || !terrain) {
    return (
      <SectionCard title="The sand table">
        {isStaff ? (
          <EmptyState
            scene={<BattlefieldScene />}
            title="No board on the table"
            description="Lay one out, paint the room, and deal the fight onto it."
            action={
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col text-xs text-ink-muted">
                  Wide
                  <input
                    type="number"
                    min={MIN_SIDE}
                    max={MAX_SIDE}
                    value={newW}
                    onChange={e => setNewW(e.target.value)}
                    className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
                  />
                </label>
                <label className="flex flex-col text-xs text-ink-muted">
                  Tall
                  <input
                    type="number"
                    min={MIN_SIDE}
                    max={MAX_SIDE}
                    value={newH}
                    onChange={e => setNewH(e.target.value)}
                    className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
                  />
                </label>
                <Button
                  size="sm"
                  color="primary"
                  isDisabled={busy}
                  onPress={async () => {
                    setBusy(true);
                    const res = await createBattleMapAction(campaignId, {
                      w: Number(newW),
                      h: Number(newH),
                    });
                    if (res.ok) {
                      await setBattleMapActiveAction(res.data.id, true);
                    } else {
                      onError(res.error);
                    }
                    setBusy(false);
                    await refresh();
                  }}
                >
                  Lay it out
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState
            scene={<BattlefieldScene />}
            title="Nothing on the table"
            description="When the DM lays out a fight, it appears here."
          />
        )}
      </SectionCard>
    );
  }

  /* --- the board ------------------------------------------------------- */

  const toolButton = (label: string, t: Tool, active: boolean) => (
    <Button
      key={label}
      size="sm"
      variant={active ? 'solid' : 'flat'}
      color={active ? 'primary' : 'default'}
      className="min-w-0 px-2.5"
      onPress={() => setTool(t)}
    >
      {label}
    </Button>
  );

  const sameTool = (a: Tool, b: Tool) =>
    JSON.stringify(a) === JSON.stringify(b);

  return (
    <SectionCard
      title={board.name || 'The sand table'}
      description={
        isStaff
          ? `${terrain.w}×${terrain.h} · ${board.tokens.length} on the board · ${board.revealed.length} tiles shown`
          : 'Tap your token, then tap where it goes.'
      }
      actions={
        <>
          <Button
            size="sm"
            variant={dimensional ? 'solid' : 'flat'}
            color={dimensional ? 'primary' : 'default'}
            onPress={toggleDimensional}
          >
            {dimensional ? 'Back to the board' : 'Stand it up'}
          </Button>
          {isStaff && (
            <>
              <Tooltip content="Reveal what the party's tokens can see, forty feet around each.">
                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={busy}
                  onPress={async () => {
                    const res = await revealFromPartyAction(board.id);
                    if (!res.ok) onError(res.error);
                    await refresh();
                  }}
                >
                  Look around
                </Button>
              </Tooltip>
              <Button
                size="sm"
                variant="flat"
                isDisabled={busy || !board.encounterId}
                onPress={async () => {
                  const res = await dealEncounterInAction(board.id);
                  if (!res.ok) onError(res.error);
                  await refresh();
                }}
              >
                Deal them in
              </Button>
              <Button
                size="sm"
                variant={board.visibility === 'shared' ? 'flat' : 'solid'}
                color={board.visibility === 'shared' ? 'default' : 'primary'}
                onPress={async () => {
                  const res = await setBattleMapVisibilityAction(
                    board.id,
                    board.visibility === 'shared' ? 'dm' : 'shared'
                  );
                  if (!res.ok) onError(res.error);
                  await refresh();
                }}
              >
                {board.visibility === 'shared'
                  ? 'Take it back'
                  : 'Show the party'}
              </Button>
            </>
          )}
        </>
      }
      bodyClassName="space-y-3"
    >
      {dimensional && (
        <BattleMap3DLazy
          terrain={terrain}
          tokens={board.tokens}
          entries={state.entries}
          currentEntryId={currentEntryId}
          portraits={state.portraits}
          faces={faces}
          dark={dark}
          speedOf={speedOf}
          onMove={async (tokenId, to) => {
            const res = await moveTokenAction(tokenId, to);
            if (!res.ok) onError(res.error);
            await refresh();
            return res.ok;
          }}
        />
      )}

      {isStaff && !dimensional && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {toolButton('Select', { kind: 'select' }, tool.kind === 'select')}
            <span className="mx-1 h-5 w-px bg-line" />
            {MATERIALS.map((m, i) => (
              <Button
                key={m.key}
                size="sm"
                variant={
                  tool.kind === 'paint' && tool.material === i
                    ? 'solid'
                    : 'flat'
                }
                color={
                  tool.kind === 'paint' && tool.material === i
                    ? 'primary'
                    : 'default'
                }
                className="min-w-0 gap-1.5 px-2"
                onPress={() => setTool({ kind: 'paint', material: i })}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-sm border border-line"
                  style={{ background: dark ? m.swatchDark : m.swatch }}
                />
                {m.name}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {toolButton(
              'Raise',
              { kind: 'raise', by: 5 },
              sameTool(tool, { kind: 'raise', by: 5 })
            )}
            {toolButton(
              'Lower',
              { kind: 'raise', by: -5 },
              sameTool(tool, { kind: 'raise', by: -5 })
            )}
            <span className="mx-1 h-5 w-px bg-line" />
            {WALLS.map(w =>
              toolButton(
                w.label,
                { kind: 'wall', wall: w.kind },
                tool.kind === 'wall' && tool.wall === w.kind
              )
            )}
            {toolButton(
              'Erase wall',
              { kind: 'erase-wall' },
              tool.kind === 'erase-wall'
            )}
            <span className="mx-1 h-5 w-px bg-line" />
            <Select
              aria-label="Prop"
              size="sm"
              className="w-32"
              placeholder="Prop"
              selectedKeys={tool.kind === 'prop' ? [tool.prop] : []}
              onSelectionChange={keys => {
                const key = String(Array.from(keys)[0] ?? '');
                const spec = PROPS.find(p => p.kind === key);
                if (spec)
                  setTool({
                    kind: 'prop',
                    prop: spec.kind,
                    blocks: spec.blocks,
                  });
              }}
            >
              {PROPS.map(p => (
                <SelectItem key={p.kind} textValue={p.label}>
                  {p.label}
                </SelectItem>
              ))}
            </Select>
            {toolButton('Light', { kind: 'light' }, tool.kind === 'light')}
            {toolButton(
              'Scenery',
              { kind: 'scenery' },
              tool.kind === 'scenery'
            )}
            <span className="mx-1 h-5 w-px bg-line" />
            {toolButton('Reveal', { kind: 'reveal' }, tool.kind === 'reveal')}
            {tool.kind === 'reveal' && (
              <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
                {([1, 2, 3] as const).map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBrush(b)}
                    aria-label={`Brush ${b * 2 - 1} tiles across`}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      brush === b
                        ? 'bg-gold font-medium text-bg'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {b * 2 - 1}×{b * 2 - 1}
                  </button>
                ))}
              </div>
            )}
            <Button
              size="sm"
              variant="light"
              className="text-ink-subtle"
              onPress={async () => {
                const res = await resetFogAction(board.id);
                if (!res.ok) onError(res.error);
                await refresh();
              }}
            >
              Fog it all
            </Button>
          </div>
        </div>
      )}

      <div
        ref={wrapRef}
        className={dimensional ? 'hidden' : 'w-full overflow-x-auto'}
      >
        <canvas
          ref={canvasRef}
          className="block cursor-crosshair touch-none rounded-md border border-line bg-bg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            setHover(null);
            onPointerUp();
          }}
        />
      </div>

      {selectedToken && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          <Glyph
            name="target"
            size={13}
            className="text-gold-strong dark:text-gold"
          />
          <span className="text-ink">
            {(selectedToken.entryId &&
              entriesById.get(selectedToken.entryId)?.label) ||
              selectedToken.label ||
              'Something'}
          </span>
          {hoverToken && hoverToken.id !== selectedToken.id ? (
            // Range, by the same Chebyshev rule the reach uses. The question a
            // table asks most, answered without counting squares out loud.
            <span className="tabular-nums">
              {distanceFeet(selectedToken, hoverToken)} ft to{' '}
              {(hoverToken.entryId &&
                entriesById.get(hoverToken.entryId)?.label) ||
                hoverToken.label ||
                'that'}
            </span>
          ) : selectedToken.mine ? (
            <span>
              Tap a lit tile to move there. {speedOf(selectedToken)} ft.
            </span>
          ) : (
            <span>Not yours to move.</span>
          )}
          {selectedToken.mine && selectedToken.entryId && (
            <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
              {(['disadvantage', 'flat', 'advantage'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => rollFrom(selectedToken, m)}
                  className="rounded px-2 py-0.5 font-mono text-xs text-ink-muted transition-colors hover:bg-gold hover:text-bg"
                  title={
                    m === 'flat' ? 'Roll a d20 as them' : `Roll a d20 with ${m}`
                  }
                >
                  {m === 'flat' ? 'd20' : m === 'advantage' ? 'adv' : 'dis'}
                </button>
              ))}
            </div>
          )}
          {isStaff && (
            <>
              {/* The ambush: a foe dealt in starts hidden, and this is the
                  moment the DM says "and then you see it". */}
              <Button
                size="sm"
                variant="flat"
                className="ml-auto"
                onPress={async () => {
                  const res = await updateTokenAction(selectedToken.id, {
                    visibility:
                      selectedToken.visibility === 'shared' ? 'dm' : 'shared',
                  });
                  if (!res.ok) onError(res.error);
                  await refresh();
                }}
              >
                {selectedToken.visibility === 'shared'
                  ? 'Hide it'
                  : 'Show them'}
              </Button>
              <Button
                size="sm"
                variant="light"
                className="text-ink-subtle"
                onPress={async () => {
                  const res = await removeTokenAction(selectedToken.id);
                  if (!res.ok) onError(res.error);
                  setSelected(null);
                  await refresh();
                }}
              >
                Take it off
              </Button>
            </>
          )}
        </div>
      )}

      {isStaff && (
        <Marginalia dash>
          diagonals are five feet — 2024 dropped the zig-zag
        </Marginalia>
      )}
    </SectionCard>
  );
}
