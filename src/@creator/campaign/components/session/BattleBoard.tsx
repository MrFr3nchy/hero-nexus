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
import {
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
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
import { floorArt, shade } from '@/@shared/battlemap/art';
import {
  blocksTile,
  edgeKey,
  FACINGS,
  inBounds,
  MATERIALS,
  MAX_SIDE,
  MIN_SIDE,
  VOID,
  type Facing,
  type ItemState,
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
  damageThingAction,
  dealEncounterInAction,
  moveTokenAction,
  pickLockAction,
  placeTokenAction,
  removeTokenAction,
  resetFogAction,
  revealFromPartyAction,
  revealTilesAction,
  saveTerrainAction,
  setBattleMapActiveAction,
  setBattleMapVisibilityAction,
  updateTokenAction,
  operateThingAction,
} from '../../battlemap-actions';
import { BattleMap3DLazy } from './BattleMap3DLazy';
import { useDiceTray } from '@/@shared/components/dice';
import { withAdvantage } from '@/@shared/lib/dice';
import { rollAction } from '../../actions';
import { usePortraits } from '@/@shared/battlemap/portraits';
import { setSelectedToken } from '@/@shared/battlemap/selection';
import { ImagePicker } from '../ImagePicker';

/* --- tools ------------------------------------------------------------- */

type Tool =
  | { kind: 'select' }
  | { kind: 'paint'; material: number }
  | { kind: 'raise'; by: 5 | -5 }
  | { kind: 'wall'; wall: WallKind }
  | { kind: 'erase-wall' }
  | { kind: 'prop'; prop: PropKind; blocks: boolean }
  /** A picture standing on a tile. Placed only once a picture is chosen. */
  | {
      kind: 'picture';
      imageId: string | null;
      height: number;
      blocks: boolean;
      facing: Facing;
    }
  | { kind: 'light' }
  | { kind: 'reveal' }
  /**
   * A thing: a scenery token, which is a row rather than terrain because a
   * player changes it. What the next tap puts down.
   */
  | {
      kind: 'scenery';
      label: string;
      imageId: string | null;
      state: ItemState | null;
      lockDc: number | null;
      hpMax: number | null;
      facing: Facing;
    };

/**
 * The toolbar's modes. Each opens on one tool and shows only its own row.
 * `hint` is the scrawl beside the strip: what a tap on the board does now.
 */
type Mode = 'select' | 'paint' | 'shape' | 'build' | 'things' | 'fog';

function modeOf(tool: Tool): Mode {
  switch (tool.kind) {
    case 'select':
      return 'select';
    case 'paint':
      return 'paint';
    case 'raise':
      return 'shape';
    case 'scenery':
      return 'things';
    case 'reveal':
      return 'fog';
    default:
      return 'build';
  }
}

const FRESH_SCENERY = {
  kind: 'scenery',
  label: '',
  imageId: null,
  state: null,
  lockDc: null,
  hpMax: null,
  facing: 'camera',
} as const satisfies Tool;

const MODES: { mode: Mode; label: string; tool: Tool; hint: string }[] = [
  {
    mode: 'select',
    label: 'Select',
    tool: { kind: 'select' },
    hint: 'tap a token, then tap where it goes',
  },
  {
    mode: 'paint',
    label: 'Floor',
    tool: { kind: 'paint', material: 1 },
    hint: 'drag to paint the floor',
  },
  {
    mode: 'shape',
    label: 'Height',
    tool: { kind: 'raise', by: 5 },
    hint: 'tap a tile to raise or lower it',
  },
  {
    mode: 'build',
    label: 'Build',
    tool: { kind: 'wall', wall: 'solid' },
    hint: 'tap an edge for a wall, a tile for the rest',
  },
  {
    mode: 'things',
    label: 'Things',
    tool: FRESH_SCENERY,
    hint: 'a door, a chest — something the party can act on',
  },
  {
    mode: 'fog',
    label: 'Fog',
    tool: { kind: 'reveal' },
    hint: 'drag to show the party what they can see',
  },
];

const FACING_LABEL: Record<Facing, string> = {
  camera: 'Faces you',
  n: 'Faces north',
  e: 'Faces east',
  s: 'Faces south',
  w: 'Faces west',
};

const STATE_LABEL: Record<ItemState, string> = {
  open: 'Open',
  closed: 'Closed',
  locked: 'Locked',
  broken: 'Broken',
};

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
  fitHeight,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
  /**
   * Pixels of height the board may use, when it is the main region of a
   * screen rather than a card on a page. Given, the tile size is the smaller
   * of what fits across and what fits down, so the whole board is in view
   * without scrolling — which is the point of putting it in front.
   */
  fitHeight?: number;
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
  // Doing something to a thing: the picker's mode and last word, and the DM's
  // amount for breaking one.
  const [lockMode, setLockMode] = useState<
    'straight' | 'advantage' | 'disadvantage'
  >('straight');
  const [lockWord, setLockWord] = useState('');
  const [hurtAmount, setHurtAmount] = useState('5');
  const describe = async (tokenId: string, patch: Record<string, unknown>) => {
    const res = await updateTokenAction(tokenId, patch);
    if (!res.ok) onError(res.error);
    await refresh();
  };
  const hurt = async (tokenId: string, sign: 1 | -1) => {
    const n = Math.abs(Math.trunc(Number(hurtAmount)) || 0);
    if (!n) return;
    const res = await damageThingAction(tokenId, sign * n);
    if (!res.ok) onError(res.error);
    await refresh();
  };
  const [selected, setSelectedLocal] = useState<string | null>(null);
  // Published, so the shelf beside the board knows the target and the foe.
  const setSelected = useCallback(
    (id: string | null) => {
      setSelectedLocal(id);
      setSelectedToken(campaignId, id);
      // The last lock's verdict belongs to the last lock.
      setLockWord('');
    },
    [campaignId]
  );
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
  const imageUrlFor = useCallback(
    (imageId: string) => `/api/campaigns/${campaignId}/images/${imageId}`,
    [campaignId]
  );
  // Portraits, the pictures tokens stand up as, and the pictures standing
  // on tiles: one set, one cache, shared with the 3D view.
  const portraitUrls = useMemo(() => {
    const urls = new Set<string>(Object.values(state.portraits ?? {}));
    for (const t of board?.tokens ?? []) if (t.imageUrl) urls.add(t.imageUrl);
    for (const pr of terrain?.props ?? []) {
      if (pr.kind === 'image' && pr.imageId) urls.add(imageUrlFor(pr.imageId));
    }
    return [...urls];
  }, [state.portraits, board?.tokens, terrain?.props, imageUrlFor]);
  const faces = usePortraits(portraitUrls);
  const faceFor = useCallback(
    (
      entry: EntryRow | undefined,
      token?: { imageUrl: string | null }
    ): HTMLImageElement | null => {
      // The token's own picture first — the DM chose it for this ogre.
      if (token?.imageUrl) return faces.get(token.imageUrl) ?? null;
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
    // A thing has no walking speed: the DM drags it wherever it goes, and a
    // lit thirty-foot reach around a door is a board full of noise.
    if (!selectedToken.entryId) return null;
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
      // An open door and a smashed chest are walked through — the server
      // applies the same rule when it checks the drop.
      board.tokens.filter(t => blocksTile(t.state)).map(asReach),
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
        case 'picture': {
          const has = next.props.findIndex(p => p.x === x && p.y === y);
          if (has >= 0) {
            next.props.splice(has, 1);
            break;
          }
          if (!tool.imageId) return;
          next.props.push({
            x,
            y,
            kind: 'image',
            blocks: tool.blocks,
            imageId: tool.imageId,
            height: tool.height,
            ...(tool.facing !== 'camera' ? { facing: tool.facing } : {}),
          });
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
        label: tool.label.trim() || 'Something',
        visibility: 'shared',
        imageId: tool.imageId,
        state: tool.state,
        lockDc: tool.state === 'locked' ? tool.lockDc : null,
        hpMax: tool.hpMax,
        facing: tool.facing,
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
      const others = board.tokens.filter(
        t => t.id !== selectedToken.id && blocksTile(t.state)
      );
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
    let size = Math.floor(width / terrain.w);
    if (fitHeight) {
      // Whatever sits above the canvas inside the region — the title bar, the
      // tools — is measured rather than guessed, so a DM's two tool rows and
      // a player's none both leave the board exactly filling what is left.
      const region = wrap.closest('[data-board-region]');
      const above = region
        ? wrap.getBoundingClientRect().top - region.getBoundingClientRect().top
        : 0;
      const room = fitHeight - above - 48;
      size = Math.max(2, Math.min(size, Math.floor(room / terrain.h)));
    }
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

    // Tiles: the same drawn surfaces the 3D view wraps onto its boxes —
    // flagstones, planks, grass — so the board is a floor and not a swatch
    // chart. A little seeded variation per tile keeps a room from reading as
    // wallpaper. Void is absent, not dark: the fog filter has already
    // removed anything a player may not see, and drawing "unknown" as a
    // shade would leak the shape of a room the server declined to describe.
    const elevationAt = (x: number, y: number): number | null => {
      if (!inBounds(terrain, x, y)) return null;
      const i = y * terrain.w + x;
      return terrain.material[i] === VOID ? null : terrain.elevation[i];
    };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (let y = 0; y < terrain.h; y++) {
      for (let x = 0; x < terrain.w; x++) {
        const i = y * terrain.w + x;
        const m = MATERIALS[terrain.material[i]] ?? MATERIALS[VOID];
        const px = x * size;
        const py = y * size;
        if (terrain.material[i] === VOID) continue;
        const art = floorArt(m.key, dark);
        if (art) ctx.drawImage(art, px, py, size, size);
        else {
          ctx.fillStyle = dark ? m.swatchDark : m.swatch;
          ctx.fillRect(px, py, size, size);
        }
        const v = ((i * 2654435761) % 1000) / 1000;
        ctx.fillStyle = v < 0.5 ? '#000000' : '#ffffff';
        ctx.globalAlpha = Math.abs(v - 0.5) * 0.14;
        ctx.fillRect(px, py, size, size);
        ctx.globalAlpha = 1;

        // Higher ground is lit, lower ground is in shadow — a wash by
        // height, so a stair of ledges reads as a stair.
        const e = terrain.elevation[i];
        if (e !== 0) {
          ctx.fillStyle = e > 0 ? '#ffffff' : '#000000';
          ctx.globalAlpha = Math.min(0.2, Math.abs(e) / 100);
          ctx.fillRect(px, py, size, size);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Grid. Faint: the tiles' own edges already carry most of it.
    ctx.strokeStyle = p.line;
    ctx.globalAlpha = dark ? 0.55 : 0.7;
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
    ctx.globalAlpha = 1;

    // Ledges: where a tile stands higher than its neighbour, the lower side
    // gets a shadow along the shared edge and the higher a thin lit lip. A
    // drop reads as a drop without a number on it — the number stays, small,
    // for anybody who wants the feet.
    for (let y = 0; y < terrain.h; y++) {
      for (let x = 0; x < terrain.w; x++) {
        const here = elevationAt(x, y);
        if (here === null) continue;
        const px = x * size;
        const py = y * size;
        const lip = Math.max(2, size * 0.1);
        const drop = Math.max(3, size * 0.22);
        const sides: [Side, number | null][] = [
          ['n', elevationAt(x, y - 1)],
          ['s', elevationAt(x, y + 1)],
          ['w', elevationAt(x - 1, y)],
          ['e', elevationAt(x + 1, y)],
        ];
        for (const [side, there] of sides) {
          if (there === null || there >= here) continue;
          // This tile is higher: shade the low tile's edge, light this one's.
          const depth = Math.min(1, (here - there) / 20);
          const x0 = side === 'e' ? px + size : px;
          const y0 = side === 's' ? py + size : py;
          const x1 =
            side === 'w' ? px - drop : side === 'e' ? px + size + drop : x0;
          const y1 =
            side === 'n' ? py - drop : side === 's' ? py + size + drop : y0;
          const shadow = ctx.createLinearGradient(x0, y0, x1, y1);
          shadow.addColorStop(0, `rgba(0,0,0,${0.22 + depth * 0.3})`);
          shadow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = shadow;
          switch (side) {
            case 'n':
              ctx.fillRect(px, py - drop, size, drop);
              break;
            case 's':
              ctx.fillRect(px, py + size, size, drop);
              break;
            case 'w':
              ctx.fillRect(px - drop, py, drop, size);
              break;
            case 'e':
              ctx.fillRect(px + size, py, drop, size);
              break;
          }
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          switch (side) {
            case 'n':
              ctx.fillRect(px, py, size, lip);
              break;
            case 's':
              ctx.fillRect(px, py + size - lip, size, lip);
              break;
            case 'w':
              ctx.fillRect(px, py, lip, size);
              break;
            case 'e':
              ctx.fillRect(px + size - lip, py, lip, size);
              break;
          }
        }
        if (here !== 0 && size >= 18) {
          ctx.fillStyle = p.ink;
          ctx.globalAlpha = 0.7;
          ctx.font = `600 ${Math.max(8, size * 0.24)}px ui-sans-serif, system-ui`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(
            `${here > 0 ? '+' : ''}${here}`,
            px + size - 3,
            py + size - 2
          );
          ctx.globalAlpha = 1;
        }
      }
    }

    // Fog, for staff: what the party has *not* been shown is hatched over,
    // and the stroke in progress is lit in gold. The first cut washed the
    // revealed tiles gold instead, and since most of a board is revealed
    // most of the time, the DM's whole room went mustard. The hidden part
    // is the smaller set and the one the DM is actually deciding about.
    if (isStaff) {
      const shown = new Set(board.revealed);
      ctx.save();
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < terrain.w * terrain.h; i++) {
        if (terrain.material[i] === VOID || shown.has(i)) continue;
        ctx.rect(
          (i % terrain.w) * size,
          Math.floor(i / terrain.w) * size,
          size,
          size
        );
        any = true;
      }
      if (any) {
        ctx.clip();
        ctx.fillStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(43,38,32,0.28)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(43,38,32,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const step = Math.max(6, size * 0.3);
        for (let d = -H; d < W; d += step) {
          ctx.moveTo(d, 0);
          ctx.lineTo(d + H, H);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (isStaff && pendingReveal.current.size > 0) {
      ctx.fillStyle = p.gold;
      ctx.globalAlpha = 0.32;
      for (const i of pendingReveal.current) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.fillRect(x * size, y * size, size, size);
      }
      ctx.globalAlpha = 1;
    }

    // Lights: a warm pool on the floor and a brazier standing in it.
    // Candlelight is the palette; lean into it.
    for (const l of terrain.lights) {
      const cx = (l.x + 0.5) * size;
      const cy = (l.y + 0.5) * size;
      const r = (l.radius / 5) * size;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(
        0,
        dark ? 'rgba(255,196,110,0.5)' : 'rgba(217,160,70,0.4)'
      );
      g.addColorStop(
        0.5,
        dark ? 'rgba(255,180,90,0.18)' : 'rgba(217,160,70,0.14)'
      );
      g.addColorStop(1, 'rgba(217,176,97,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      const bowl = Math.max(3, size * 0.16);
      ctx.fillStyle = dark ? '#2a2622' : '#3a3530';
      ctx.beginPath();
      ctx.arc(cx, cy, bowl, 0, Math.PI * 2);
      ctx.fill();
      const flame = ctx.createRadialGradient(cx, cy, 0, cx, cy, bowl * 0.8);
      flame.addColorStop(0, '#fff2c0');
      flame.addColorStop(0.5, '#ffb050');
      flame.addColorStop(1, 'rgba(230,100,30,0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.arc(cx, cy, bowl * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reach, for the selected token: a faint gold fill and an inset outline
    // per tile — the lit squares a game shows when a piece is picked up.
    // Nothing else on the board is a gold fill now that the fog is a hatch
    // over the hidden part, so the two cannot be mistaken for each other.
    if (reach) {
      const inset = Math.max(3, size * 0.14);
      for (const i of reach.keys()) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.fillStyle = p.gold;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
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
      if (pr.kind === 'image') {
        // The picture itself, fitted inside the tile, so the top-down board
        // shows the tree the DM stood up rather than a mark for it. A
        // dashed square while it loads.
        const img = pr.imageId ? faces.get(imageUrlFor(pr.imageId)) : null;
        const box = size * 0.9;
        if (img) {
          const scale = Math.min(
            box / img.naturalWidth,
            box / img.naturalHeight
          );
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
        } else {
          ctx.strokeStyle = p.inkMuted;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(cx - box / 2, cy - box / 2, box, box);
          ctx.setLineDash([]);
        }
        continue;
      }
      // Stone things in stone, wooden things in wood, a tree in leaf — the
      // colours the 3D view builds them from, with a shadow underneath.
      const stoneFill = dark ? '#5a5248' : '#a1968a';
      const woodFill = dark ? MATERIALS[4].swatchDark : MATERIALS[4].swatch;
      const leafFill = dark ? '#3f5a2e' : '#7ea35e';
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(cx + size * 0.04, cy + size * 0.06, s * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark ? '#1c1814' : '#3a3530';
      ctx.fillStyle =
        pr.kind === 'tree'
          ? leafFill
          : pr.kind === 'table' || pr.kind === 'chest' || pr.kind === 'barrel'
            ? woodFill
            : stoneFill;
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

    // Walls on edges, drawn with a little depth: masonry as a dark band
    // with a lit coping, a door as its plank leaf — swung open into the
    // room, with the arc it swept — a window as stone with the arcane pane
    // between, a rail as posts and a line.
    const walls = wallIndex(terrain);
    const masonryInk = dark ? '#1c1814' : '#3a3530';
    const masonryLit = dark ? '#8a7d6b' : '#a1968a';
    const plank = dark ? MATERIALS[4].swatchDark : MATERIALS[4].swatch;
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
      // The edge's own direction, and the way into the tile it belongs to.
      const dx = bx - ax;
      const dy = by - ay;
      const inX = w.side === 'w' ? 1 : w.side === 'e' ? -1 : 0;
      const inY = w.side === 'n' ? 1 : w.side === 's' ? -1 : 0;
      const thick = Math.max(3, size * 0.16);
      ctx.lineCap = 'butt';
      ctx.setLineDash([]);
      if (w.kind !== 'rail') {
        // The shadow a standing wall throws, so it is not a line on paper.
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = thick * 1.6;
        ctx.beginPath();
        ctx.moveTo(ax + size * 0.04, ay + size * 0.06);
        ctx.lineTo(bx + size * 0.04, by + size * 0.06);
        ctx.stroke();
      }
      switch (w.kind) {
        case 'solid':
          ctx.strokeStyle = masonryInk;
          ctx.lineWidth = thick;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.strokeStyle = masonryLit;
          ctx.lineWidth = Math.max(1, thick * 0.3);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          break;
        case 'door': {
          // Jambs at both ends, in stone.
          ctx.strokeStyle = masonryInk;
          ctx.lineWidth = thick;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax + dx * 0.12, ay + dy * 0.12);
          ctx.moveTo(bx - dx * 0.12, by - dy * 0.12);
          ctx.lineTo(bx, by);
          ctx.stroke();
          const hx = ax + dx * 0.12;
          const hy = ay + dy * 0.12;
          const len = Math.hypot(dx, dy) * 0.76;
          ctx.lineWidth = Math.max(3, size * 0.12);
          ctx.strokeStyle = shade(plank, dark ? 0.15 : -0.25);
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          if (w.open) {
            // Swung into its tile on the hinge, and the sweep it took.
            ctx.lineTo(hx + inX * len, hy + inY * len);
            ctx.stroke();
            ctx.strokeStyle = p.success;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            const start = Math.atan2(dy, dx);
            const end = Math.atan2(inY, inX);
            const ccw = (end - start + Math.PI * 3) % (Math.PI * 2) > Math.PI;
            ctx.arc(hx, hy, len, start, end, ccw);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.lineTo(bx - dx * 0.12, by - dy * 0.12);
            ctx.stroke();
            // The strapping.
            ctx.strokeStyle = dark ? '#1c1815' : '#2a2622';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (const f of [0.35, 0.65]) {
              const sx = hx + dx * 0.76 * f;
              const sy = hy + dy * 0.76 * f;
              ctx.moveTo(sx - inX * thick * 0.5, sy - inY * thick * 0.5);
              ctx.lineTo(sx + inX * thick * 0.5, sy + inY * thick * 0.5);
            }
            ctx.stroke();
          }
          break;
        }
        case 'window':
          ctx.strokeStyle = masonryInk;
          ctx.lineWidth = thick;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.strokeStyle = p.arcane;
          ctx.lineWidth = Math.max(2, thick * 0.45);
          ctx.beginPath();
          ctx.moveTo(ax + dx * 0.15, ay + dy * 0.15);
          ctx.lineTo(bx - dx * 0.15, by - dy * 0.15);
          ctx.stroke();
          break;
        case 'rail':
          ctx.strokeStyle = p.inkMuted;
          ctx.lineWidth = Math.max(1.5, size * 0.06);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.fillStyle = p.inkMuted;
          for (const f of [0.08, 0.5, 0.92]) {
            ctx.beginPath();
            ctx.arc(
              ax + dx * f,
              ay + dy * f,
              Math.max(1.5, size * 0.06),
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
          break;
      }
    }
    ctx.setLineDash([]);
    ctx.lineCap = 'round';

    // Tokens: the same piece the 3D view stands up, seen from above. A soft
    // ring of the side's colour on the floor, a pewter base with the side's
    // colour as its rim, the face inside, and the hit points as an arc round
    // the outside — not a counter painted in the side's colour edge to edge.
    for (const t of board.tokens) {
      const entry = t.entryId ? entriesById.get(t.entryId) : undefined;
      const label = entry?.label ?? t.label ?? '';
      const cx = (t.x + t.footprint / 2) * size;
      const cy = (t.y + t.footprint / 2) * size;
      const r = Math.max(
        1,
        (size * t.footprint) / 2 - Math.max(4, size * 0.16)
      );
      const faint = t.visibility === 'dm';
      const sideColour =
        entry?.side === 'foe'
          ? p.danger
          : entry?.side === 'party'
            ? p.gold
            : p.inkMuted;

      // The halo on the floor.
      const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.5);
      halo.addColorStop(0, sideColour);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.globalAlpha = faint ? 0.2 : 0.45;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // The base: pewter, with a shadow under its edge.
      ctx.globalAlpha = faint ? 0.45 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(cx + size * 0.03, cy + size * 0.04, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark ? '#4c463e' : '#8a8173';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = sideColour;
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // HP as an arc, by the HeroCard rule: the tone says how it is going,
      // the arc's length says how much is left. For a foe the server has
      // nulled the numbers for a player, so there is no arc — as the tracker
      // shows a word rather than a number.
      const tone = hpTone(entry, p);
      if (tone && entry && entry.hpCurrent !== null && entry.hpMax) {
        const ratio = Math.max(0, Math.min(1, entry.hpCurrent / entry.hpMax));
        const ar = r + Math.max(2, size * 0.07);
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, ar, 0, Math.PI * 2);
        ctx.stroke();
        if (ratio > 0) {
          ctx.strokeStyle = tone;
          ctx.beginPath();
          ctx.arc(cx, cy, ar, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
          ctx.stroke();
        }
      }

      // The one animated thing: whose turn it is.
      if (entry && entry.id === currentEntryId) {
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.setLineDash([size * 0.12, size * 0.08]);
        ctx.beginPath();
        ctx.arc(cx, cy, r + Math.max(5, size * 0.18), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Selection.
      if (t.id === selected) {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + Math.max(8, size * 0.26), 0, Math.PI * 2);
        ctx.stroke();
      }

      // The face, clipped inside the rim, or initials when there is none.
      const face = faceFor(entry, t);
      const inner = r - Math.max(2, size * 0.07);
      if (face) {
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
        ctx.globalAlpha = faint ? 0.5 : 1;
        ctx.drawImage(face, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.globalAlpha = 1;
        ctx.restore();
      } else {
        ctx.fillStyle = '#ece3cf';
        ctx.globalAlpha = faint ? 0.6 : 1;
        ctx.font = `600 ${Math.max(9, inner * 0.85)}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials(label), cx, cy + 1);
        ctx.globalAlpha = 1;
      }

      // What a thing is: a lock on a locked one, a cross through a broken
      // one, and an open one drawn lighter — it no longer blocks its tile.
      if (t.state === 'locked') {
        const k = Math.max(4, size * 0.16);
        const lx = cx + r - k;
        const ly = cy - r;
        ctx.fillStyle = p.ink;
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = Math.max(1.5, k * 0.25);
        ctx.beginPath();
        ctx.arc(lx + k / 2, ly + k * 0.45, k * 0.3, Math.PI, 0);
        ctx.stroke();
        ctx.fillRect(lx, ly + k * 0.45, k, k * 0.75);
      } else if (t.state === 'broken') {
        ctx.strokeStyle = p.danger;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy - r * 0.7);
        ctx.lineTo(cx + r * 0.7, cy + r * 0.7);
        ctx.moveTo(cx + r * 0.7, cy - r * 0.7);
        ctx.lineTo(cx - r * 0.7, cy + r * 0.7);
        ctx.stroke();
      } else if (t.state === 'open') {
        ctx.strokeStyle = p.success;
        ctx.lineWidth = Math.max(1.5, size * 0.05);
        ctx.setLineDash([size * 0.1, size * 0.1]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
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
    faces,
    imageUrlFor,
    dimensional,
    pendingCount,
    brush,
    fitHeight,
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
  const mode = modeOf(tool);

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
          imageUrlFor={imageUrlFor}
          dark={dark}
          fill={Boolean(fitHeight)}
          speedOf={speedOf}
          onSelect={setSelected}
          selectedId={selected}
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
          {/* One row of modes, one row of the chosen mode's tools. Every
              tool at once was twenty-five buttons across two rows, and a DM
              painting a floor does not need the fog brush in view. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
              {MODES.map(m => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => setTool(m.tool)}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    mode === m.mode
                      ? 'bg-gold font-medium text-bg'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Marginalia dash className="ml-1">
              {MODES.find(m => m.mode === mode)?.hint}
            </Marginalia>
          </div>

          {mode === 'paint' && (
            <div className="flex flex-wrap items-center gap-1.5">
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
          )}

          {mode === 'shape' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {toolButton(
                'Raise 5 ft',
                { kind: 'raise', by: 5 },
                sameTool(tool, { kind: 'raise', by: 5 })
              )}
              {toolButton(
                'Lower 5 ft',
                { kind: 'raise', by: -5 },
                sameTool(tool, { kind: 'raise', by: -5 })
              )}
            </div>
          )}

          {mode === 'build' && (
            <div className="flex flex-wrap items-center gap-1.5">
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
              {toolButton(
                'Picture',
                tool.kind === 'picture'
                  ? tool
                  : {
                      kind: 'picture',
                      imageId: null,
                      height: 10,
                      blocks: true,
                      facing: 'camera',
                    },
                tool.kind === 'picture'
              )}
              {toolButton('Brazier', { kind: 'light' }, tool.kind === 'light')}
            </div>
          )}

          {mode === 'fog' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {toolButton('Reveal', { kind: 'reveal' }, tool.kind === 'reveal')}
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
          )}
        </div>
      )}

      {isStaff && tool.kind === 'picture' && (
        <div className="mb-2 flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-2 px-3 py-2">
          <ImagePicker
            campaignId={campaignId}
            value={tool.imageId}
            onChange={imageId => setTool({ ...tool, imageId })}
            label="A picture to stand on a tile"
            library
            hint={false}
          />
          <Input
            size="sm"
            type="number"
            label="Feet tall"
            className="w-24"
            min={1}
            max={100}
            value={String(tool.height)}
            onValueChange={v =>
              setTool({
                ...tool,
                height: Math.max(1, Math.min(100, Math.trunc(Number(v)) || 10)),
              })
            }
          />
          <Checkbox
            size="sm"
            isSelected={tool.blocks}
            onValueChange={blocks => setTool({ ...tool, blocks })}
          >
            <span className="text-sm text-ink-muted">Blocks the tile</span>
          </Checkbox>
          <Select
            aria-label="Which way it faces"
            size="sm"
            className="w-36"
            selectedKeys={[tool.facing]}
            onSelectionChange={keys => {
              const key = String(Array.from(keys)[0] ?? 'camera');
              setTool({ ...tool, facing: key as Facing });
            }}
          >
            {FACINGS.map(f => (
              <SelectItem key={f} textValue={FACING_LABEL[f]}>
                {FACING_LABEL[f]}
              </SelectItem>
            ))}
          </Select>
          <Marginalia dash>
            {tool.imageId
              ? 'tap a tile to stand it there; tap again to take it down'
              : 'choose a picture first'}
          </Marginalia>
        </div>
      )}

      {/* A thing: what the next tap puts down. A door with a lock and forty
          hit points, a window, a chest — a row a player can do something
          to, not a mark in the DM's terrain. */}
      {isStaff && tool.kind === 'scenery' && (
        <div className="mb-2 flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-2 px-3 py-2">
          <Input
            size="sm"
            label="What it is"
            placeholder="The cellar door"
            className="w-44"
            value={tool.label}
            onValueChange={label => setTool({ ...tool, label })}
          />
          <ImagePicker
            campaignId={campaignId}
            value={tool.imageId}
            onChange={imageId => setTool({ ...tool, imageId })}
            label="Stands up as"
            library
            hint={false}
          />
          <Select
            aria-label="Its state"
            size="sm"
            label="State"
            className="w-40"
            selectedKeys={[tool.state ?? 'none']}
            onSelectionChange={keys => {
              const key = String(Array.from(keys)[0] ?? 'none');
              setTool({
                ...tool,
                state: key === 'none' ? null : (key as ItemState),
              });
            }}
          >
            <SelectItem key="none" textValue="Nothing to open">
              Just a thing
            </SelectItem>
            <SelectItem key="closed" textValue="Closed">
              Closed
            </SelectItem>
            <SelectItem key="open" textValue="Open">
              Open
            </SelectItem>
            <SelectItem key="locked" textValue="Locked">
              Locked
            </SelectItem>
          </Select>
          {tool.state === 'locked' && (
            <Input
              size="sm"
              type="number"
              label="Lock DC"
              className="w-24"
              min={1}
              max={40}
              value={tool.lockDc === null ? '' : String(tool.lockDc)}
              onValueChange={v =>
                setTool({
                  ...tool,
                  lockDc:
                    v.trim() === '' ? null : Math.trunc(Number(v)) || null,
                })
              }
            />
          )}
          <Input
            size="sm"
            type="number"
            label="Hit points"
            placeholder="unbreakable"
            className="w-36"
            min={1}
            max={9999}
            value={tool.hpMax === null ? '' : String(tool.hpMax)}
            onValueChange={v =>
              setTool({
                ...tool,
                hpMax: v.trim() === '' ? null : Math.trunc(Number(v)) || null,
              })
            }
          />
          <Select
            aria-label="Which way it faces"
            size="sm"
            label="Faces"
            className="w-36"
            selectedKeys={[tool.facing]}
            onSelectionChange={keys => {
              const key = String(Array.from(keys)[0] ?? 'camera');
              setTool({ ...tool, facing: key as Facing });
            }}
          >
            {FACINGS.map(f => (
              <SelectItem key={f} textValue={FACING_LABEL[f]}>
                {FACING_LABEL[f]}
              </SelectItem>
            ))}
          </Select>
          <Marginalia dash>tap a tile to put it down</Marginalia>
        </div>
      )}

      <div
        ref={wrapRef}
        className={
          dimensional
            ? 'hidden'
            : fitHeight
              ? 'flex w-full justify-center overflow-x-auto'
              : 'w-full overflow-x-auto'
        }
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
              {selectedToken.entryId
                ? `Tap a lit tile to move there. ${speedOf(selectedToken)} ft.`
                : 'Tap a tile to move it.'}
            </span>
          ) : (
            <span>Not yours to move.</span>
          )}
          {/* What a thing is, and what can be done to it. Anyone beside it
              opens or closes it; a locked one is picked, rolled on the
              server off the picker's own sheet; the DM sets what it is. */}
          {selectedToken.entryId === null && selectedToken.state && (
            <span
              className={`rounded-sm border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] ${
                selectedToken.state === 'locked'
                  ? 'border-ink/40 text-ink'
                  : selectedToken.state === 'broken'
                    ? 'border-danger/40 text-danger'
                    : selectedToken.state === 'open'
                      ? 'border-success/40 text-success'
                      : 'border-line text-ink-muted'
              }`}
            >
              {STATE_LABEL[selectedToken.state]}
            </span>
          )}
          {selectedToken.entryId === null &&
            (selectedToken.state === 'open' ||
              selectedToken.state === 'closed') && (
              <Button
                size="sm"
                variant="flat"
                className="h-7 min-w-0 px-2.5 text-xs"
                onPress={async () => {
                  const res = await operateThingAction(
                    selectedToken.id,
                    selectedToken.state === 'open' ? 'close' : 'open'
                  );
                  if (!res.ok) onError(res.error);
                  await refresh();
                }}
              >
                {selectedToken.state === 'open' ? 'Close it' : 'Open it'}
              </Button>
            )}
          {selectedToken.entryId === null &&
            selectedToken.state === 'locked' && (
              <span className="inline-flex items-center gap-1">
                <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
                  {(['disadvantage', 'straight', 'advantage'] as const).map(
                    m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setLockMode(m)}
                        className={`rounded px-2 py-0.5 text-[0.7rem] transition-colors ${
                          lockMode === m
                            ? 'bg-gold font-medium text-bg'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {m === 'straight'
                          ? 'straight'
                          : m === 'advantage'
                            ? 'adv'
                            : 'dis'}
                      </button>
                    )
                  )}
                </div>
                <Tooltip content="Dexterity (Sleight of Hand), rolled on the server off your own sheet, against a DC the DM set and you are not told.">
                  <Button
                    size="sm"
                    color="primary"
                    className="h-7 min-w-0 px-2.5 text-xs"
                    onPress={async () => {
                      const res = await pickLockAction(
                        selectedToken.id,
                        lockMode
                      );
                      if (!res.ok) {
                        onError(res.error);
                        return;
                      }
                      setLockWord(
                        res.data.opened
                          ? `${res.data.total} — the lock gives`
                          : `${res.data.total} — it holds`
                      );
                      await refresh();
                    }}
                  >
                    Pick the lock
                  </Button>
                </Tooltip>
                {lockWord && (
                  <span className="text-xs text-ink-muted">{lockWord}</span>
                )}
              </span>
            )}
          {selectedToken.entryId === null &&
            isStaff &&
            selectedToken.hpMax !== null && (
              <span className="inline-flex items-center gap-1 text-xs">
                <span className="tabular-nums text-ink-muted">
                  {selectedToken.hpCurrent ?? selectedToken.hpMax} /{' '}
                  {selectedToken.hpMax} hp
                </span>
                <Button
                  size="sm"
                  variant="flat"
                  className="h-7 min-w-0 px-2 text-danger"
                  aria-label="Damage it"
                  onPress={() => hurt(selectedToken.id, -1)}
                >
                  −
                </Button>
                <Input
                  size="sm"
                  type="number"
                  aria-label="How much"
                  className="w-16"
                  classNames={{ inputWrapper: 'h-7 min-h-7' }}
                  min={0}
                  value={hurtAmount}
                  onValueChange={setHurtAmount}
                />
                <Button
                  size="sm"
                  variant="flat"
                  className="h-7 min-w-0 px-2 text-success"
                  aria-label="Mend it"
                  onPress={() => hurt(selectedToken.id, 1)}
                >
                  +
                </Button>
              </span>
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
              {/* What it stands up as. A hero has a portrait; an ogre has
                  whatever the DM uploaded, and it is the same ogre picture
                  for all five of them. */}
              {selectedToken.entryId === null && (
                <Popover placement="top-end">
                  <PopoverTrigger>
                    <Button size="sm" variant="flat" className="ml-auto">
                      What it is
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 border border-line bg-surface p-3">
                    <div className="flex w-full flex-col gap-2">
                      <Select
                        aria-label="Its state"
                        size="sm"
                        label="State"
                        selectedKeys={[selectedToken.state ?? 'none']}
                        onSelectionChange={keys => {
                          const key = String(Array.from(keys)[0] ?? 'none');
                          void describe(selectedToken.id, {
                            state: key === 'none' ? null : (key as ItemState),
                          });
                        }}
                      >
                        <SelectItem key="none" textValue="Nothing to open">
                          Just a thing
                        </SelectItem>
                        <SelectItem key="closed" textValue="Closed">
                          Closed
                        </SelectItem>
                        <SelectItem key="open" textValue="Open">
                          Open
                        </SelectItem>
                        <SelectItem key="locked" textValue="Locked">
                          Locked
                        </SelectItem>
                        <SelectItem key="broken" textValue="Broken">
                          Broken
                        </SelectItem>
                      </Select>
                      <Input
                        size="sm"
                        type="number"
                        label="Lock DC"
                        placeholder="10"
                        min={1}
                        max={40}
                        defaultValue={
                          selectedToken.lockDc === null
                            ? ''
                            : String(selectedToken.lockDc)
                        }
                        onBlur={e => {
                          const v = e.currentTarget.value.trim();
                          void describe(selectedToken.id, {
                            lockDc: v === '' ? null : Math.trunc(Number(v)),
                          });
                        }}
                      />
                      <Input
                        size="sm"
                        type="number"
                        label="Hit points"
                        placeholder="unbreakable"
                        min={1}
                        max={9999}
                        defaultValue={
                          selectedToken.hpMax === null
                            ? ''
                            : String(selectedToken.hpMax)
                        }
                        onBlur={e => {
                          const v = e.currentTarget.value.trim();
                          const next = v === '' ? null : Math.trunc(Number(v));
                          if (next === selectedToken.hpMax) return;
                          void describe(selectedToken.id, { hpMax: next });
                        }}
                      />
                      <Select
                        aria-label="Which way it faces"
                        size="sm"
                        label="Faces"
                        selectedKeys={[selectedToken.facing]}
                        onSelectionChange={keys => {
                          const key = String(Array.from(keys)[0] ?? 'camera');
                          void describe(selectedToken.id, {
                            facing: key as Facing,
                          });
                        }}
                      >
                        {FACINGS.map(f => (
                          <SelectItem key={f} textValue={FACING_LABEL[f]}>
                            {FACING_LABEL[f]}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Popover placement="top-end">
                <PopoverTrigger>
                  <Button
                    size="sm"
                    variant="flat"
                    className={selectedToken.entryId ? 'ml-auto' : ''}
                  >
                    {selectedToken.imageId ? 'Picture' : 'Give it a picture'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 border border-line bg-surface p-3">
                  <div className="w-full">
                    <ImagePicker
                      campaignId={campaignId}
                      value={selectedToken.imageId}
                      onChange={async imageId => {
                        const res = await updateTokenAction(selectedToken.id, {
                          imageId,
                        });
                        if (!res.ok) onError(res.error);
                        await refresh();
                      }}
                      label="Stands up as"
                      library
                    />
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                size="sm"
                variant="flat"
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
