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
  brushTiles,
  canStandUnder,
  distanceFeet,
  distanceSquares,
  floodFill,
  jumpLandings,
  linkCostFeet,
  linksUnder,
  reachFor,
  rectTiles,
  roomEdits,
  wallIndex,
} from '@/@creator/campaign/lib/battlemap';
import { floorArt, shade } from '@/@shared/battlemap/art';
import {
  edgeKey,
  FACINGS,
  feetLabel,
  inBounds,
  levelOf,
  linkOtherEnd,
  linkTiles,
  MATERIALS,
  MAX_SIDE,
  MIN_SIDE,
  shortId,
  VOID,
  withLevel,
  type BoardDoc,
  type Facing,
  type ItemState,
  type LevelDoc,
  type LevelLink,
  type LinkKind,
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
  takeLinkAction,
  updateTokenAction,
  operateThingAction,
} from '../../battlemap-actions';
import { FloorRail } from './FloorRail';
import { BattleMap3DLazy } from './BattleMap3DLazy';
import { FaceEntry, useDiceTray } from '@/@shared/components/dice';
import { withAdvantage } from '@/@shared/lib/dice';
import { physicalDiceAllowed } from '@/@creator/campaign/lib/table-rules';
import { rollAction } from '../../actions';
import { usePortraits } from '@/@shared/battlemap/portraits';
import {
  setSelectedTokens,
  toggleSelectedToken,
  useSelectedTokens,
} from '@/@shared/battlemap/selection';
import { setPlacement, usePlacement } from '@/@shared/battlemap/placement';
import { ImagePicker } from '../ImagePicker';
import { Refused, type RefusedState } from '../Refused';
import { EffectPicker, type PickerEntry } from './EffectPicker';
import { speedReasons } from '@/@creator/campaign/lib/condition-effects';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import { movementBudget } from '@/@creator/campaign/lib/turn';
import { TurnStrip } from './TurnStrip';
import { areaTiles, type AreaShape } from '@/@creator/campaign/lib/battlemap';
import { setLitArea } from '@/@shared/battlemap/area';
import { litAt } from '@/@creator/campaign/lib/things';
import { ThingEffectEditor } from './ThingEffectEditor';
import { SightControls } from './SightControls';

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
   * Two corners, one write. `apply` says which of the three brushed layers
   * the box lands on; `value` is the material index, the feet to raise or
   * lower by, or nothing for a reveal.
   */
  | { kind: 'rect'; apply: 'material' | 'elevation' | 'reveal'; value: number }
  /** Tap a tile: every connected tile of the same floor takes this one. */
  | { kind: 'fill'; material: number }
  /**
   * A room in one drag (floors): the floor painted, walls round it, a door
   * where it meets a room already there.
   */
  | { kind: 'room'; material: number; door: boolean }
  /**
   * Stairs or a ladder in one drag (floors): the box is the footprint on
   * this floor and on `to`, and a token that ends its move on it is
   * offered the other floor.
   */
  | { kind: 'link'; link: LinkKind; to: string }
  /** Two taps, feet between them. Anybody's, not only staff's. */
  | { kind: 'ruler' }
  /**
   * A spell's shape on the grid (07): tap the origin, then where it points;
   * the tiles light and the shelf's Cast panel takes who is inside. Anybody's.
   */
  | { kind: 'area'; shape: AreaShape; size: number }
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
type Mode =
  | 'select'
  | 'ruler'
  | 'area'
  | 'rooms'
  | 'paint'
  | 'shape'
  | 'build'
  | 'things'
  | 'fog';

function modeOf(tool: Tool): Mode {
  switch (tool.kind) {
    case 'select':
      return 'select';
    case 'ruler':
      return 'ruler';
    case 'area':
      return 'area';
    case 'room':
      return 'rooms';
    case 'paint':
    case 'fill':
      return 'paint';
    case 'raise':
      return 'shape';
    case 'rect':
      return tool.apply === 'material'
        ? 'paint'
        : tool.apply === 'elevation'
          ? 'shape'
          : 'fog';
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
    hint: 'tap a token, then tap where it goes · shift-tap for more',
  },
  {
    mode: 'ruler',
    label: 'Ruler',
    tool: { kind: 'ruler' },
    hint: 'tap two tiles for the feet between them',
  },
  {
    mode: 'area',
    label: 'Area',
    tool: { kind: 'area', shape: 'sphere', size: 20 },
    hint: 'tap the origin, then where it points · the shelf casts on who is inside',
  },
  {
    mode: 'rooms',
    label: 'Rooms',
    tool: { kind: 'room', material: 4, door: true },
    hint: 'drag a box — floor, walls and a door in one go',
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
    hint: 'drag to raise or lower the ground',
  },
  {
    mode: 'build',
    label: 'Build',
    tool: { kind: 'wall', wall: 'solid' },
    hint: 'tap an edge for a wall, a tile for the rest · drag a box for stairs',
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

const LINK_LABEL: Record<LinkKind, string> = {
  stairs: 'Stairs',
  ladder: 'Ladder',
};

/** "the grand stair", "the ladder" — what a link is called in a sentence. */
function linkName(link: LevelLink): string {
  return (
    link.name?.trim() || (link.kind === 'ladder' ? 'the ladder' : 'the stairs')
  );
}

/**
 * A floor in a sentence: "the upper floor", or "a floor unseen" for one
 * the reader has not been shown — a player's board carries the stairs
 * before it carries where they lead.
 */
function levelPhrase(board: BoardDoc, id: string): string {
  const name = board.levels.find(l => l.id === id)?.name;
  return name ? `the ${name.toLowerCase()}` : 'a floor unseen';
}

/** How far a token may be shown to reach. The rules module prices it. */
const DEFAULT_SPEED_FEET = 30;

/** Debounce on terrain writes. Painting is a stream; the save is a document. */
const SAVE_MS = 500;

/** Shape and size for the area tool (07). Shown to staff and players alike. */
function AreaControls({
  tool,
  onChange,
}: {
  tool: { kind: 'area'; shape: AreaShape; size: number };
  onChange: (next: { kind: 'area'; shape: AreaShape; size: number }) => void;
}) {
  const shapes: { key: AreaShape; label: string }[] = [
    { key: 'sphere', label: 'Sphere' },
    { key: 'cube', label: 'Cube' },
    { key: 'cone', label: 'Cone' },
    { key: 'line', label: 'Line' },
    { key: 'emanation', label: 'Emanation' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
        {shapes.map(sh => (
          <button
            key={sh.key}
            type="button"
            onClick={() => onChange({ ...tool, shape: sh.key })}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              tool.shape === sh.key
                ? 'bg-arcane font-medium text-bg'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {sh.label}
          </button>
        ))}
      </div>
      <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
        {[5, 10, 15, 20, 30, 60].map(ft => (
          <button
            key={ft}
            type="button"
            onClick={() => onChange({ ...tool, size: ft })}
            className={`rounded px-2 py-0.5 text-xs tabular-nums transition-colors ${
              tool.size === ft
                ? 'bg-arcane font-medium text-bg'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {ft} ft
          </button>
        ))}
      </div>
    </div>
  );
}

/** 1×1 / 3×3 / 5×5. One picker, shared by the floor, the height and the fog. */
function BrushPicker({
  brush,
  onChange,
}: {
  brush: 1 | 2 | 3;
  onChange: (b: 1 | 2 | 3) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
      {([1, 2, 3] as const).map(b => (
        <button
          key={b}
          type="button"
          onClick={() => onChange(b)}
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
  );
}

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
  const [doc, setDoc] = useState<BoardDoc | null>(board?.terrain ?? null);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!board) {
      setDoc(null);
      return;
    }
    if (!dirty.current) setDoc(board.terrain);
  }, [board]);

  // A group shares the turn (11): every member's reach lights on it.
  const currentEntryIds = useMemo(
    () => new Set(state.turnEntryIds),
    [state.turnEntryIds]
  );

  /*
   * Which floor is in front (floors). The board follows somebody by
   * default — the DM's follows whoever's turn it is, a player's follows
   * their own hero — and a tab picked by hand stops the following until
   * it is switched back on. What is drawn, hit and painted below is one
   * floor: `terrain` is that floor's document and `here` the tokens on it.
   */
  const [pickedLevel, setPickedLevel] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const followed = useMemo(() => {
    if (!board) return null;
    const t = isStaff
      ? board.tokens.find(t => t.entryId && currentEntryIds.has(t.entryId))
      : board.tokens.find(t => t.mine && t.entryId);
    return t?.level ?? null;
  }, [board, isStaff, currentEntryIds]);
  const terrain: LevelDoc | null = doc
    ? levelOf(doc, follow && followed ? followed : pickedLevel)
    : null;
  const levelId = terrain?.id ?? null;
  const pickLevel = useCallback((id: string) => {
    setPickedLevel(id);
    setFollow(false);
  }, []);
  const here = useMemo(
    () => (board ? board.tokens.filter(t => t.level === levelId) : []),
    [board, levelId]
  );
  // Page Up / Page Down walk the floors, for anybody at the table.
  useEffect(() => {
    if (!doc || !levelId) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'PageUp' && ev.key !== 'PageDown') return;
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const i = doc.levels.findIndex(l => l.id === levelId);
      const next = doc.levels[i + (ev.key === 'PageUp' ? 1 : -1)];
      if (!next) return;
      ev.preventDefault();
      pickLevel(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, levelId, pickLevel]);
  /** The stairs under the selection, and whether the offer was declined. */
  const [declinedLink, setDeclinedLink] = useState<string | null>(null);
  /** Stairs picked in select mode, for the DM to name, hide or remove. */
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  /** Draw the floor below in dashed outline, so a stairwell lands on a stair. */
  const [onion, setOnion] = useState(true);

  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  // The DM's keyboard (11): a digit names a mode, F the fog. The board's
  // tool state is its own, so it listens rather than being handed a prop.
  useEffect(() => {
    if (!isStaff) return;
    const onMode = (e: Event) => {
      const wanted = (e as CustomEvent<{ mode: Mode }>).detail?.mode;
      const m = MODES.find(x => x.mode === wanted);
      if (m) setTool(m.tool);
    };
    window.addEventListener('hero-nexus:board', onMode);
    return () => window.removeEventListener('hero-nexus:board', onMode);
  }, [isStaff]);
  // The stairs tool points at a neighbouring floor; when the floor in
  // front changes under it, it points at that floor's neighbour instead.
  useEffect(() => {
    if (!doc || !levelId || tool.kind !== 'link') return;
    if (tool.to !== levelId && doc.levels.some(l => l.id === tool.to)) return;
    const i = doc.levels.findIndex(l => l.id === levelId);
    const next = doc.levels[i + 1] ?? doc.levels[i - 1];
    if (next) setTool({ ...tool, to: next.id });
  }, [doc, levelId, tool]);
  // Doing something to a thing: the picker's mode and last word, and the DM's
  // amount for breaking one.
  const [lockMode, setLockMode] = useState<
    'straight' | 'advantage' | 'disadvantage'
  >('straight');
  const [lockWord, setLockWord] = useState('');
  const [hurtAmount, setHurtAmount] = useState('5');
  /*
   * A refusal the rules made — lava, a pillar — shown on the board rather
   * than in the header, with the DM's way past it when the server said
   * there is one. The model's refusals (off the board, on somebody) are
   * never overridable and go to `onError` like before.
   */
  const [refused, setRefused] = useState<RefusedState | null>(null);
  const move = async (
    tokenId: string,
    to: { x: number; y: number },
    ruling = false
  ): Promise<boolean> => {
    const res = await moveTokenAction(tokenId, to, { ruling });
    if (!res.ok) {
      if (res.overridable) {
        setRefused({
          message: res.error,
          ruling: async () => {
            await move(tokenId, to, true);
            await refresh();
          },
        });
      } else {
        onError(res.error);
      }
    } else {
      setRefused(null);
    }
    return res.ok;
  };
  const describe = async (tokenId: string, patch: Record<string, unknown>) => {
    const res = await updateTokenAction(tokenId, patch);
    if (!res.ok) onError(res.error);
    await refresh();
  };
  /**
   * Pick a lock: rolled on the server off the picker's own sheet, and the
   * tray draws the faces it rolled — the lock used to give or hold with
   * nothing thrown.
   */
  const pick = async (tokenId: string, faces?: number[]) => {
    const res = await pickLockAction(tokenId, lockMode, faces);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    setLockWord(
      res.data.opened
        ? `${res.data.total} — the lock gives`
        : `${res.data.total} — it holds`
    );
    void tray.showNotationRoll(res.data.roll, {
      title: 'Pick the lock',
      hint: res.data.opened ? 'the lock gives' : 'it holds',
      physical: res.data.physical,
    });
    await refresh();
  };
  const physicalDice = physicalDiceAllowed(state.rules, isStaff);
  const hurt = async (tokenId: string, sign: 1 | -1) => {
    const n = Math.abs(Math.trunc(Number(hurtAmount)) || 0);
    if (!n) return;
    const res = await damageThingAction(tokenId, sign * n);
    if (!res.ok) onError(res.error);
    await refresh();
  };
  /*
   * The selection lives in the store the shelf reads, not here: the attacks
   * panel aims at the last token picked and the stat block shows it, and a
   * shift-tap adds a second so a group can be walked together. `selected`
   * is that last one — what "the selected token" has always meant.
   */
  const selectedIds = useSelectedTokens(campaignId);
  const selected = selectedIds.length
    ? selectedIds[selectedIds.length - 1]
    : null;
  const setSelected = useCallback(
    (id: string | null) => {
      setSelectedTokens(campaignId, id ? [id] : []);
      // The last lock's verdict belongs to the last lock.
      setLockWord('');
    },
    [campaignId]
  );
  /*
   * A combatant the initiative panel asked to have placed: the next tap on
   * a tile is where they stand. Staff only, and Escape lets go of it.
   */
  const placing = usePlacement(campaignId);
  useEffect(() => {
    if (!placing) return;
    // Whatever the DM was painting, the next tap is a placement.
    setTool({ kind: 'select' });
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setPlacement(campaignId, null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, campaignId]);
  /*
   * The ruler: an origin, a far end that follows the pointer until it is
   * pinned by a second tap, and a third tap that clears it. Feet by the
   * table's diagonal rule, squares beside them for the people who count.
   */
  const [ruler, setRuler] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number } | null;
    pinned: boolean;
  } | null>(null);
  /** The area: an origin, a far end that follows the pointer until pinned. */
  const [areaPick, setAreaPick] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number } | null;
    pinned: boolean;
  } | null>(null);
  useEffect(() => {
    if (tool.kind !== 'area') {
      setAreaPick(null);
      setLitArea(campaignId, null);
    }
  }, [tool.kind, campaignId]);

  useEffect(() => {
    if (tool.kind !== 'ruler') setRuler(null);
  }, [tool.kind]);
  /** The rectangle tool's box while it is being dragged. */
  const [marquee, setMarquee] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
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
   * The brush, shared by the floor, the height and the fog: 1×1, 3×3, 5×5.
   * It began as the reveal brush alone, and filling a room square by square
   * with the floor tool was the complaint that made it everybody's.
   *
   * For the fog, tiles are gathered during the stroke and drawn as pending,
   * then sent **once on pointer-up** — one write per stroke rather than one
   * per pointer event — the same trap a token drag avoids.
   */
  const [brush, setBrush] = useState<1 | 2 | 3>(1);
  const pendingReveal = useRef(new Set<number>());
  const [pendingCount, setPendingCount] = useState(0);
  const revealTilesPending = useCallback((indices: number[]) => {
    let added = 0;
    for (const i of indices) {
      if (!pendingReveal.current.has(i)) {
        pendingReveal.current.add(i);
        added += 1;
      }
    }
    if (added) setPendingCount(pendingReveal.current.size);
  }, []);
  const brushAt = useCallback(
    (x: number, y: number) => {
      if (!terrain) return;
      revealTilesPending(brushTiles(terrain, { x, y }, brush));
    },
    [terrain, brush, revealTilesPending]
  );
  const flushReveal = useCallback(async () => {
    if (!board || pendingReveal.current.size === 0) return;
    const indices = [...pendingReveal.current];
    pendingReveal.current.clear();
    setPendingCount(0);
    const res = await revealTilesAction(
      board.id,
      indices,
      levelId ?? undefined
    );
    if (!res.ok) onError(res.error);
    await refresh();
  }, [board, levelId, onError, refresh]);
  const [busy, setBusy] = useState(false);
  const [newW, setNewW] = useState('20');
  const [newH, setNewH] = useState('15');
  /** What every tile of a new board starts as. Void, unless the DM says. */
  const [newFloor, setNewFloor] = useState(String(VOID));
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
  const selectedEntry = selectedToken?.entryId
    ? (entriesById.get(selectedToken.entryId) ?? null)
    : null;

  /**
   * Speed off the sheet, for a seated character; the default for a monster
   * dealt in from the bestiary, whose stat block the tracker does not carry.
   * Then through `speedFor`: grappled is 0, prone crawls, exhaustion takes
   * its 5 ft a level — one rules module, so the board and the play card say
   * the same number. Advice, not a fence: `moveToken` fences only under
   * Enforce (01), because a DM saying "you can't get there this turn" is how
   * that rule is applied at a table.
   */
  const speedOf = useCallback(
    (t: { entryId: string | null }): number => {
      const entry = t.entryId ? entriesById.get(t.entryId) : undefined;
      if (!entry) return DEFAULT_SPEED_FEET;
      // On the combatant's own turn the reach is what is *left*: the speed
      // the server priced (conditions, exhaustion, the block) less what the
      // turn has already walked, doubled by Dash. Off their turn, the whole
      // speed — the DM planning where the ogre goes next.
      return currentEntryIds.has(entry.id)
        ? movementBudget(entry.turn, entry.speed)
        : entry.speed;
    },
    [entriesById, currentEntryIds]
  );

  /** Why the reach is what it is — "Grappled · speed 0". Empty when unremarkable. */
  const speedWhy = useCallback(
    (t: { entryId: string | null }): string[] => {
      const entry = t.entryId ? entriesById.get(t.entryId) : undefined;
      const sheet = entry?.characterId
        ? state.party.find(p => p.characterId === entry.characterId)
        : undefined;
      return speedReasons(
        parseConditions(entry?.conditionKeys ?? ''),
        sheet?.exhaustion ?? 0,
        sheet?.weight ?? null
      );
    },
    [entriesById, state.party]
  );

  /** A hero's long jump, for the sand table to ring the far side of a gap (09). */
  const jumpOf = useCallback(
    (t: { entryId: string | null }) => {
      const entry = t.entryId ? entriesById.get(t.entryId) : undefined;
      const hero = entry?.characterId
        ? state.party.find(p => p.characterId === entry.characterId)
        : undefined;
      return hero
        ? { long: hero.jump.long, standing: hero.jump.longStanding }
        : null;
    },
    [entriesById, state.party]
  );

  /** The combatants under the selection, for putting one effect on all of them. */
  const selectedEntries = useMemo<PickerEntry[]>(() => {
    if (!board) return [];
    const out: PickerEntry[] = [];
    for (const id of selectedIds) {
      const token = board.tokens.find(t => t.id === id);
      const entry = token?.entryId ? entriesById.get(token.entryId) : undefined;
      if (entry) {
        out.push({
          id: entry.id,
          label: entry.label,
          conditionKeys: entry.conditionKeys,
        });
      }
    }
    return out;
  }, [board, selectedIds, entriesById]);

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
    // On another floor, nothing on this one is in reach.
    if (selectedToken.level !== terrain.id) return null;
    return reachFor(
      terrain,
      asReach(selectedToken),
      // An open door and a smashed chest are walked through — the server
      // applies the same rule when it checks the drop.
      here.filter(t => t.blocks).map(asReach),
      speedOf(selectedToken)
    );
  }, [terrain, selectedToken, board, here, sideOf, speedOf]);

  /**
   * Where the selected hero could jump to (09): the far side of a gap in
   * each direction, within the sheet's long jump. Heroes only — the book's
   * distance is off a Strength score the tracker does not carry for a
   * monster. Ringed on the board, not filled, so a landing reads apart
   * from the walking reach.
   */
  const jumps = useMemo(() => {
    if (!terrain || !selectedToken || !board || !selectedToken.entryId) {
      return null;
    }
    if (selectedToken.level !== terrain.id) return null;
    const entry = entriesById.get(selectedToken.entryId);
    const hero = entry?.characterId
      ? state.party.find(p => p.characterId === entry.characterId)
      : undefined;
    if (!hero) return null;
    const landings = jumpLandings(
      terrain,
      selectedToken,
      here.filter(t => t.id !== selectedToken.id && t.blocks),
      hero.jump.long,
      hero.jump.longStanding
    );
    return { landings, long: hero.jump.long, standing: hero.jump.longStanding };
  }, [terrain, selectedToken, board, here, entriesById, state.party]);

  /**
   * The stairs the selected token is standing on (floors): what the board
   * offers when a move ends on them. Hidden stairs are not offered to a
   * player — the server has already left them out of a player's board —
   * and staff see them dashed.
   */
  const stairsUnder = useMemo(() => {
    if (!doc || !terrain || !selectedToken || !selectedToken.entryId) {
      return null;
    }
    if (selectedToken.level !== terrain.id || !selectedToken.mine) return null;
    const links = linksUnder(doc, terrain.id, selectedToken).filter(
      l => !l.hidden || isStaff
    );
    const link = links[0];
    if (!link) return null;
    const otherId = linkOtherEnd(link, terrain.id);
    if (!otherId) return null;
    const other = doc.levels.find(l => l.id === otherId);
    return {
      link,
      otherId,
      otherPhrase: levelPhrase(doc, otherId),
      up: (other?.feet ?? terrain.feet + 1) > terrain.feet,
      feet: linkCostFeet(doc, link, terrain.id),
    };
  }, [doc, terrain, selectedToken, isStaff]);
  useEffect(() => {
    setDeclinedLink(null);
  }, [selected]);
  const climb = async (ruling = false) => {
    if (!selectedToken || !stairsUnder) return;
    const res = await takeLinkAction(selectedToken.id, stairsUnder.link.id, {
      ruling,
    });
    if (!res.ok) {
      if (res.overridable) {
        setRefused({
          message: res.error,
          ruling: async () => {
            await climb(true);
            await refresh();
          },
        });
      } else {
        onError(res.error);
      }
    } else {
      setRefused(null);
      // Go with them: the board turns to the floor they landed on, unless
      // it is already following them there.
      if (!follow) setPickedLevel(res.data.level);
    }
    await refresh();
  };

  /* --- the area ---------------------------------------------------------- */

  const litArea = useMemo(() => {
    if (!terrain || !board || tool.kind !== 'area' || !areaPick) return null;
    const area = {
      shape: tool.shape,
      level: terrain.id,
      origin: areaPick.from,
      direction: areaPick.to ?? undefined,
      size: tool.size,
    };
    const tiles = areaTiles(terrain, area);
    const inside = here.filter(t => {
      if (!t.entryId) return false;
      for (let dy = 0; dy < t.footprint; dy++) {
        for (let dx = 0; dx < t.footprint; dx++) {
          if (tiles.has((t.y + dy) * terrain.w + (t.x + dx))) return true;
        }
      }
      return false;
    });
    const entryIds = [...new Set(inside.map(t => t.entryId as string))];
    return {
      area,
      tiles,
      entryIds,
      labels: entryIds.map(id => entriesById.get(id)?.label ?? 'Something'),
    };
  }, [terrain, board, here, tool, areaPick, entriesById]);

  useEffect(() => {
    setLitArea(
      campaignId,
      litArea && areaPick?.pinned
        ? {
            area: litArea.area,
            entryIds: litArea.entryIds,
            labels: litArea.labels,
            tiles: [...litArea.tiles],
          }
        : null
    );
  }, [campaignId, litArea, areaPick?.pinned]);

  /* --- saving ---------------------------------------------------------- */

  const scheduleSave = useCallback(
    (next: BoardDoc) => {
      if (!board) return;
      dirty.current = true;
      setDoc(next);
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
  /** One floor edited; the whole board written. */
  const saveLevel = useCallback(
    (next: TerrainDoc) => {
      if (!doc || !terrain) return;
      scheduleSave(
        withLevel(doc, {
          ...next,
          id: terrain.id,
          name: terrain.name,
          feet: terrain.feet,
        })
      );
    },
    [doc, terrain, scheduleSave]
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
        case 'paint': {
          let changed = false;
          for (const t of brushTiles(terrain, { x, y }, brush)) {
            if (next.material[t] === tool.material) continue;
            next.material[t] = tool.material;
            changed = true;
          }
          if (!changed) return;
          break;
        }
        case 'raise':
          for (const t of brushTiles(terrain, { x, y }, brush)) {
            next.elevation[t] = Math.max(
              -50,
              Math.min(200, next.elevation[t] + tool.by)
            );
          }
          break;
        case 'fill': {
          if (next.material[i] === tool.material) return;
          for (const t of floodFill(terrain, { x, y })) {
            next.material[t] = tool.material;
          }
          break;
        }
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
      saveLevel(next);
    },
    [terrain, isStaff, tool, brush, saveLevel]
  );

  /** The rectangle tool's one write, on pointer-up. */
  const applyRect = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (!terrain || !doc || !isStaff) return;
      if (tool.kind === 'room') {
        saveLevel(
          roomEdits(terrain, from, to, tool.material, { door: tool.door })
        );
        return;
      }
      if (tool.kind === 'link') {
        const to2 = doc.levels.find(l => l.id === tool.to);
        if (!to2 || to2.id === terrain.id) return;
        const link: LevelLink = {
          id: shortId(),
          kind: tool.link,
          x: Math.min(from.x, to.x),
          y: Math.min(from.y, to.y),
          w: Math.min(6, Math.abs(to.x - from.x) + 1),
          h: Math.min(6, Math.abs(to.y - from.y) + 1),
          from: to2.feet < terrain.feet ? to2.id : terrain.id,
          to: to2.feet < terrain.feet ? terrain.id : to2.id,
        };
        scheduleSave({ ...doc, links: [...doc.links, link] });
        setSelectedLink(link.id);
        return;
      }
      if (tool.kind !== 'rect') return;
      const tiles = rectTiles(terrain, from, to);
      if (tool.apply === 'reveal') {
        revealTilesPending(tiles);
        flushReveal();
        return;
      }
      const next: TerrainDoc = {
        ...terrain,
        elevation: [...terrain.elevation],
        material: [...terrain.material],
      };
      for (const t of tiles) {
        if (tool.apply === 'material') next.material[t] = tool.value;
        else {
          next.elevation[t] = Math.max(
            -50,
            Math.min(200, next.elevation[t] + tool.value)
          );
        }
      }
      saveLevel(next);
    },
    [
      terrain,
      doc,
      isStaff,
      tool,
      revealTilesPending,
      flushReveal,
      saveLevel,
      scheduleSave,
    ]
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
      saveLevel({ ...terrain, walls });
    },
    [terrain, isStaff, saveLevel]
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

    // The ruler is anybody's. First tap sets the origin, the second pins
    // the far end, the third clears it.
    if (tool.kind === 'ruler') {
      if (!ruler) setRuler({ from: at, to: null, pinned: false });
      else if (!ruler.pinned) setRuler({ ...ruler, to: at, pinned: true });
      else setRuler(null);
      return;
    }

    // The area is anybody's too: origin, then direction, then clear.
    if (tool.kind === 'area') {
      if (!areaPick) setAreaPick({ from: at, to: null, pinned: false });
      else if (!areaPick.pinned)
        setAreaPick({ ...areaPick, to: at, pinned: true });
      else setAreaPick(null);
      return;
    }

    // Somebody the initiative panel asked to have placed: this is where.
    if (isStaff && placing && tool.kind === 'select') {
      const res = await placeTokenAction(board.id, {
        entryId: placing.entryId,
        x: at.x,
        y: at.y,
        level: terrain.id,
        visibility: 'dm',
      });
      if (!res.ok) onError(res.error);
      else setPlacement(campaignId, null);
      await refresh();
      return;
    }

    // Staff with a building tool: paint. Everything else is selection and
    // movement, which players and staff share.
    if (isStaff && tool.kind !== 'select' && tool.kind !== 'scenery') {
      if (
        tool.kind === 'rect' ||
        tool.kind === 'room' ||
        tool.kind === 'link'
      ) {
        setMarquee({ from: at, to: at });
        return;
      }
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
      const place = async (ruling = false) => {
        const res = await placeTokenAction(board.id, {
          x: at.x,
          y: at.y,
          level: terrain.id,
          label: tool.label.trim() || 'Something',
          visibility: 'shared',
          imageId: tool.imageId,
          state: tool.state,
          lockDc: tool.state === 'locked' ? tool.lockDc : null,
          hpMax: tool.hpMax,
          facing: tool.facing,
          ruling,
        });
        if (!res.ok) {
          if (res.overridable) {
            setRefused({
              message: res.error,
              ruling: async () => {
                await place(true);
                await refresh();
              },
            });
          } else {
            onError(res.error);
          }
        } else {
          setRefused(null);
        }
      };
      await place();
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

    const hit = here.find(
      t =>
        at.x >= t.x &&
        at.x < t.x + t.footprint &&
        at.y >= t.y &&
        at.y < t.y + t.footprint
    );

    if (hit) {
      // Shift adds to the selection, so a group can be picked up together;
      // a plain tap on the selected token lets it go.
      setSelectedLink(null);
      if (ev.shiftKey) toggleSelectedToken(campaignId, hit.id);
      else
        setSelected(
          hit.id === selected && selectedIds.length === 1 ? null : hit.id
        );
      return;
    }

    // The stairs themselves, for the DM to name, hide or take away — when
    // nobody is picked up, so a token on the stairs still walks.
    if (isStaff && doc && !(selectedToken && selectedToken.mine)) {
      const i = at.y * terrain.w + at.x;
      const stair = doc.links.find(
        l =>
          (l.from === terrain.id || l.to === terrain.id) &&
          linkTiles(doc, l).includes(i)
      );
      if (stair) {
        setSelectedLink(stair.id === selectedLink ? null : stair.id);
        setSelected(null);
        return;
      }
    }

    // An empty tile with a token selected: move it there, if it may be.
    // Under advise the tile may be lava and the move still goes: the board
    // has said so in red, and saying is all advising does. Staff are never
    // stopped here at all — the server refuses them with a way past it, and
    // a refusal swallowed in the browser has no "Do it anyway".
    if (
      selectedToken &&
      selectedToken.mine &&
      selectedToken.level === terrain.id
    ) {
      const others = here.filter(t => t.id !== selectedToken.id && t.blocks);
      if (
        !canStandUnder(
          terrain,
          { x: at.x, y: at.y, footprint: selectedToken.footprint },
          others,
          isStaff ? 'advise' : state.rules.mode
        )
      ) {
        return;
      }
      setBusy(true);
      // A group moves by the same step the picked token takes; each move is
      // its own claim, and the server refuses each on its own.
      const dx = at.x - selectedToken.x;
      const dy = at.y - selectedToken.y;
      const group = here.filter(
        t => selectedIds.includes(t.id) && t.id !== selectedToken.id && t.mine
      );
      await move(selectedToken.id, { x: at.x, y: at.y });
      for (const t of group) {
        await move(t.id, { x: t.x + dx, y: t.y + dy });
      }
      setBusy(false);
      await refresh();
      return;
    }

    setSelected(null);
    setSelectedLink(null);
  };

  const hoverToken = useMemo(() => {
    if (!hover || !board) return null;
    return (
      here.find(
        t =>
          hover.x >= t.x &&
          hover.x < t.x + t.footprint &&
          hover.y >= t.y &&
          hover.y < t.y + t.footprint
      ) ?? null
    );
  }, [hover, board, here]);

  const onPointerMove = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const at = tileAt(ev);
    setHover(at);
    if (at && ruler && !ruler.pinned) setRuler({ ...ruler, to: at });
    if (at && areaPick && !areaPick.pinned)
      setAreaPick({ ...areaPick, to: at });
    if (at && marquee) setMarquee({ ...marquee, to: at });
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
    if (marquee) {
      applyRect(marquee.from, marquee.to);
      setMarquee(null);
    }
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
    // Below this a token's rim is wider than its face and `arc` throws on
    // the negative radius, taking the page down — a phone held sideways
    // with a region measured before it had a height found it. Draw nothing
    // and wait for the next measurement rather than draw a crash.
    if (size < 6) return;
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

    // The floor below, ghosted (floors): the outline of its rooms and its
    // walls in dashes, so a stairwell is cut where the stair comes up and a
    // bedroom sits over a hall rather than over the garden. Staff only —
    // a player has not necessarily seen the floor below.
    const belowIdx = doc ? doc.levels.findIndex(l => l.id === terrain.id) : -1;
    const below =
      isStaff && onion && doc && belowIdx > 0 ? doc.levels[belowIdx - 1] : null;
    if (below) {
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.globalAlpha = dark ? 0.35 : 0.3;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const floorBelow = (x: number, y: number) =>
        inBounds(below, x, y) && below.material[y * below.w + x] !== VOID;
      for (let y = 0; y < below.h; y++) {
        for (let x = 0; x < below.w; x++) {
          if (!floorBelow(x, y)) continue;
          const px = x * size;
          const py = y * size;
          if (!floorBelow(x, y - 1)) {
            ctx.moveTo(px, py);
            ctx.lineTo(px + size, py);
          }
          if (!floorBelow(x, y + 1)) {
            ctx.moveTo(px, py + size);
            ctx.lineTo(px + size, py + size);
          }
          if (!floorBelow(x - 1, y)) {
            ctx.moveTo(px, py);
            ctx.lineTo(px, py + size);
          }
          if (!floorBelow(x + 1, y)) {
            ctx.moveTo(px + size, py);
            ctx.lineTo(px + size, py + size);
          }
        }
      }
      for (const w of below.walls) {
        const x0 = w.x * size;
        const y0 = w.y * size;
        switch (w.side) {
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
      }
      ctx.stroke();
      ctx.restore();
    }

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
      const shown = new Set(board.revealed[terrain.id] ?? []);
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
    // The area a spell would cover, in the arcane hue.
    if (litArea) {
      ctx.fillStyle = p.arcane;
      ctx.globalAlpha = 0.35;
      for (const i of litArea.tiles) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.fillRect(x * size, y * size, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.arcane;
      ctx.lineWidth = 2;
      const ox = (litArea.area.origin.x + 0.5) * size;
      const oy = (litArea.area.origin.y + 0.5) * size;
      ctx.beginPath();
      ctx.arc(ox, oy, size * 0.2, 0, Math.PI * 2);
      ctx.stroke();
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

    // A dark board (08): what nobody lights sits under a cool grey, so the
    // party can tell "we have seen this" from "we can see this now". Torches
    // carried by tokens light their pool the way a brazier does.
    const torches = here
      .filter(t => t.lightFeet && t.lightFeet > 0)
      .map(t => ({ x: t.x, y: t.y, radiusFeet: t.lightFeet as number }));
    if (terrain.ambient === 'dark') {
      ctx.fillStyle = dark ? 'rgba(60,70,90,0.45)' : 'rgba(70,80,100,0.35)';
      for (let y = 0; y < terrain.h; y++) {
        for (let x = 0; x < terrain.w; x++) {
          const i = y * terrain.w + x;
          if (terrain.material[i] === VOID) continue;
          if (litAt(terrain, { x, y }, torches)) continue;
          ctx.fillRect(x * size, y * size, size, size);
        }
      }
    }
    for (const t of torches) {
      const cx = (t.x + 0.5) * size;
      const cy = (t.y + 0.5) * size;
      const r = (t.radiusFeet / 5) * size;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(
        0,
        dark ? 'rgba(255,196,110,0.4)' : 'rgba(217,160,70,0.3)'
      );
      g.addColorStop(1, 'rgba(217,176,97,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
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

    // Jump landings: a dashed ring on the far side of a gap, nothing
    // filled — a place you can get to, not a place you can walk to. Round,
    // where the reach is square, so a landing that is also in walking reach
    // still reads as a jump.
    if (jumps && jumps.landings.length > 0) {
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const i of jumps.landings) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.beginPath();
        ctx.arc(
          (x + 0.5) * size,
          (y + 0.5) * size,
          size * 0.36,
          0,
          Math.PI * 2
        );
        ctx.stroke();
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

    // Stairs and ladders (floors): treads across the footprint, a gold
    // edge, and a tag saying which way they go. They stand on both floors,
    // so the same drawing is on the floor above, tagged the other way. A
    // hidden stair is dashed, and only staff are drawing it at all.
    const stairsHere = doc
      ? doc.links.filter(l => l.from === terrain.id || l.to === terrain.id)
      : [];
    for (const l of stairsHere) {
      const x0 = l.x * size;
      const y0 = l.y * size;
      const w = l.w * size;
      const h = l.h * size;
      const up = l.from === terrain.id;
      const tall = l.h >= l.w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, w, h);
      ctx.clip();
      ctx.fillStyle = dark ? '#2a231a' : '#e9dfc9';
      ctx.fillRect(x0, y0, w, h);
      const treadFill = dark ? '#9c8763' : '#a8905e';
      const treadGap = Math.max(4, size * (l.kind === 'ladder' ? 0.45 : 0.3));
      ctx.fillStyle = treadFill;
      if (l.kind === 'ladder') {
        // Two rails and rungs between them.
        const rail = Math.max(2, size * 0.1);
        const inset = Math.max(3, size * 0.2);
        if (tall) {
          ctx.fillRect(x0 + inset, y0, rail, h);
          ctx.fillRect(x0 + w - inset - rail, y0, rail, h);
          for (let y = y0 + treadGap / 2; y < y0 + h; y += treadGap)
            ctx.fillRect(x0 + inset, y, w - inset * 2, rail);
        } else {
          ctx.fillRect(x0, y0 + inset, w, rail);
          ctx.fillRect(x0, y0 + h - inset - rail, w, rail);
          for (let x = x0 + treadGap / 2; x < x0 + w; x += treadGap)
            ctx.fillRect(x, y0 + inset, rail, h - inset * 2);
        }
      } else {
        const tread = Math.max(2, treadGap * 0.45);
        if (tall) {
          for (let y = y0; y < y0 + h; y += treadGap)
            ctx.fillRect(x0, y, w, tread);
        } else {
          for (let x = x0; x < x0 + w; x += treadGap)
            ctx.fillRect(x, y0, tread, h);
        }
      }
      ctx.restore();
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 2;
      ctx.setLineDash(l.hidden ? [4, 4] : []);
      ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
      ctx.setLineDash([]);
      if (l.id === selectedLink) {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6);
      }
      if (size >= 14) {
        const tag = up ? 'UP' : 'DOWN';
        ctx.font = `700 ${Math.max(8, size * 0.28)}px Inter, system-ui, sans-serif`;
        const tw = ctx.measureText(tag).width + 6;
        const th = Math.max(10, size * 0.4);
        ctx.fillStyle = p.gold;
        ctx.fillRect(x0 + 2, y0 + 2, tw, th);
        ctx.fillStyle = dark ? '#16130f' : '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, x0 + 5, y0 + 2 + th / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
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
    for (const t of here) {
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
      if (entry && currentEntryIds.has(entry.id)) {
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.setLineDash([size * 0.12, size * 0.08]);
        ctx.beginPath();
        ctx.arc(cx, cy, r + Math.max(5, size * 0.18), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Selection. Every token in the group wears the ring; the last one
      // picked — the target — wears it in ink, the rest in gold.
      if (selectedIds.includes(t.id)) {
        ctx.strokeStyle = t.id === selected ? p.ink : p.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + Math.max(8, size * 0.26), 0, Math.PI * 2);
        ctx.stroke();
      }

      // The turn, as four pips under the selected token whose turn it is:
      // action, bonus, reaction, movement — filled when spent. The same
      // data the card's strip shows; drawn here so the board answers "has
      // it acted" on its own.
      if (t.id === selected && entry && currentEntryIds.has(entry.id)) {
        const pr = Math.max(2, size * 0.07);
        const gap = pr * 2.6;
        const py = cy + r + Math.max(8, size * 0.26) + pr * 2.2;
        const spent = [
          entry.turn.action,
          entry.turn.bonus,
          entry.turn.reaction,
          movementBudget(entry.turn, entry.speed) === 0,
        ];
        spent.forEach((on, i) => {
          const px = cx + (i - 1.5) * gap;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fillStyle = on ? p.gold : 'rgba(0,0,0,0.35)';
          ctx.fill();
          ctx.strokeStyle = p.gold;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
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

    // Who is at the other end of the stairs (floors): a small tag beside
    // each, counting the heroes and foes on the floor it leads to — the
    // ones this reader may see, which for a player is the ones the party
    // has. The board answers "is anybody up there" without a tab switch.
    if (doc && size >= 12) {
      for (const l of stairsHere) {
        const otherId = linkOtherEnd(l, terrain.id);
        if (!otherId) continue;
        let heroes = 0;
        let foes = 0;
        for (const t of board.tokens) {
          if (t.level !== otherId || !t.entryId) continue;
          const side = entriesById.get(t.entryId)?.side;
          if (side === 'party') heroes += 1;
          else if (side === 'foe') foes += 1;
        }
        if (heroes === 0 && foes === 0) continue;
        const bits: string[] = [];
        if (heroes) bits.push(`${heroes} ${heroes === 1 ? 'hero' : 'heroes'}`);
        if (foes) bits.push(`${foes} ${foes === 1 ? 'foe' : 'foes'}`);
        const up = l.from === terrain.id;
        const text = `${up ? '↑' : '↓'} ${bits.join(', ')} ${up ? 'upstairs' : 'below'}`;
        ctx.font = `600 ${Math.max(10, size * 0.34)}px Inter, system-ui, sans-serif`;
        const tw = ctx.measureText(text).width + 10;
        const th = Math.max(16, size * 0.5);
        const bx = Math.min(W - tw - 2, (l.x + l.w) * size + 4);
        const by = Math.max(2, l.y * size + 2);
        ctx.fillStyle = p.surface;
        ctx.globalAlpha = 0.94;
        ctx.fillRect(bx, by, tw, th);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
        ctx.fillStyle = p.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + 5, by + th / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
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
      } else if (
        tool.kind !== 'rect' &&
        tool.kind !== 'room' &&
        tool.kind !== 'link' &&
        tool.kind !== 'ruler'
      ) {
        const brushed =
          tool.kind === 'reveal' ||
          tool.kind === 'paint' ||
          tool.kind === 'raise';
        const r = brushed ? brush - 1 : 0;
        ctx.strokeRect(
          (hover.x - r) * size + 1,
          (hover.y - r) * size + 1,
          size * (2 * r + 1) - 2,
          size * (2 * r + 1) - 2
        );
      }
    }

    // The rectangle being dragged: a dashed box over the tiles it will take.
    if (marquee) {
      const x0 = Math.min(marquee.from.x, marquee.to.x) * size;
      const y0 = Math.min(marquee.from.y, marquee.to.y) * size;
      const x1 = (Math.max(marquee.from.x, marquee.to.x) + 1) * size;
      const y1 = (Math.max(marquee.from.y, marquee.to.y) + 1) * size;
      ctx.fillStyle = p.gold;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
      ctx.setLineDash([]);
    }

    // The ruler: a line between two tile centres and the feet beside it.
    if (ruler && ruler.to) {
      const ax = (ruler.from.x + 0.5) * size;
      const ay = (ruler.from.y + 0.5) * size;
      const bx = (ruler.to.x + 0.5) * size;
      const by = (ruler.to.y + 0.5) * size;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.setLineDash(ruler.pinned ? [] : [6, 4]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y] of [
        [ax, ay],
        [bx, by],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(3, size * 0.1), 0, Math.PI * 2);
        ctx.fillStyle = p.ink;
        ctx.fill();
      }
      const feet = distanceFeet(ruler.from, ruler.to, state.rules.diagonals);
      const squares = distanceSquares(ruler.from, ruler.to);
      const label = `${feet} ft · ${squares} sq`;
      ctx.font = `600 ${Math.max(11, size * 0.4)}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(label).width + 10;
      const th = Math.max(16, size * 0.55);
      const lx = Math.min(W - tw - 2, Math.max(2, (ax + bx) / 2 - tw / 2));
      const ly = Math.min(H - th - 2, Math.max(2, (ay + by) / 2 - th - 6));
      ctx.fillStyle = p.surface;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(lx, ly, tw, th);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx + 0.5, ly + 0.5, tw - 1, th - 1);
      ctx.fillStyle = p.ink;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 5, ly + th / 2);
      ctx.textBaseline = 'alphabetic';
    }
  }, [
    terrain,
    board,
    dark,
    isStaff,
    entriesById,
    currentEntryId,
    currentEntryIds,
    selected,
    selectedIds,
    reach,
    jumps,
    hover,
    tool,
    faceFor,
    faces,
    imageUrlFor,
    dimensional,
    pendingCount,
    brush,
    fitHeight,
    marquee,
    ruler,
    litArea,
    state.rules.diagonals,
    doc,
    here,
    onion,
    selectedLink,
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
                <label className="flex flex-col text-xs text-ink-muted">
                  Floor
                  <select
                    value={newFloor}
                    onChange={e => setNewFloor(e.target.value)}
                    className="h-[30px] rounded-md border border-line bg-surface px-2 text-sm text-ink"
                  >
                    {MATERIALS.map((m, i) => (
                      <option key={m.key} value={i}>
                        {i === VOID ? 'Nothing yet' : m.name}
                      </option>
                    ))}
                  </select>
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
                      material: Number(newFloor),
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
  /** The floor a paint, box or fill tool carries; stone for anything else. */
  const floorOf = (t: Tool): number =>
    t.kind === 'paint' || t.kind === 'fill'
      ? t.material
      : t.kind === 'rect' && t.apply === 'material'
        ? t.value
        : 1;
  const withFloor = (t: Tool, material: number): Tool =>
    t.kind === 'fill'
      ? { kind: 'fill', material }
      : t.kind === 'rect' && t.apply === 'material'
        ? { kind: 'rect', apply: 'material', value: material }
        : { kind: 'paint', material };

  return (
    <SectionCard
      title={board.name || 'The sand table'}
      description={
        isStaff
          ? `${terrain.w}×${terrain.h} · ${doc && doc.levels.length > 1 ? `${doc.levels.length} floors · ` : ''}${board.tokens.length} on the board · ${(board.revealed[terrain.id] ?? []).length} tiles shown on the ${terrain.name.toLowerCase()}`
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
      {doc && (
        <FloorRail
          board={doc}
          tokens={board.tokens}
          entriesById={entriesById}
          levelId={terrain.id}
          isStaff={isStaff}
          follow={follow}
          onPick={pickLevel}
          onFollow={() => setFollow(true)}
          onion={onion}
          onOnion={setOnion}
          onChange={next => {
            scheduleSave(next);
          }}
          onAdded={id => {
            pickLevel(id);
            // A new floor is open air: the DM is about to build on it.
            setTool({ kind: 'room', material: 4, door: true });
          }}
          onError={onError}
        />
      )}

      {dimensional && (
        <BattleMap3DLazy
          terrain={terrain}
          tokens={here}
          entries={state.entries}
          currentEntryId={currentEntryId}
          portraits={state.portraits}
          faces={faces}
          imageUrlFor={imageUrlFor}
          dark={dark}
          fill={Boolean(fitHeight)}
          speedOf={speedOf}
          jumpOf={jumpOf}
          onSelect={setSelected}
          selectedId={selected}
          mode={isStaff ? 'advise' : state.rules.mode}
          onMove={async (tokenId, to) => {
            const ok = await move(tokenId, to);
            await refresh();
            return ok;
          }}
        />
      )}

      {refused && (
        <Refused refusal={refused} onDismiss={() => setRefused(null)} />
      )}

      {placing && isStaff && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink">
          <Glyph name="target" size={14} className="text-gold" />
          <span>Tap where {placing.label} stands.</span>
          <button
            type="button"
            onClick={() => setPlacement(campaignId, null)}
            className="ml-auto text-xs text-ink-subtle hover:text-ink"
          >
            Never mind · Esc
          </button>
        </div>
      )}

      {/* A player's rail: no paint, but the ruler is everybody's. */}
      {!isStaff && !dimensional && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
            {MODES.filter(
              m =>
                m.mode === 'select' || m.mode === 'ruler' || m.mode === 'area'
            ).map(m => (
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
          {tool.kind === 'area' && (
            <AreaControls tool={tool} onChange={setTool} />
          )}
        </div>
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

          {tool.kind === 'area' && (
            <AreaControls tool={tool} onChange={setTool} />
          )}

          {mode === 'rooms' && tool.kind === 'room' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {MATERIALS.filter((_, i) => i !== VOID).map((m, i) => {
                const idx = i + 1;
                const chosen = tool.material === idx;
                return (
                  <Button
                    key={m.key}
                    size="sm"
                    variant={chosen ? 'solid' : 'flat'}
                    color={chosen ? 'primary' : 'default'}
                    className="min-w-0 gap-1.5 px-2"
                    onPress={() => setTool({ ...tool, material: idx })}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 rounded-sm border border-line"
                      style={{ background: dark ? m.swatchDark : m.swatch }}
                    />
                    {m.name}
                  </Button>
                );
              })}
              <span className="mx-1 h-5 w-px bg-line" />
              <Checkbox
                size="sm"
                isSelected={tool.door}
                onValueChange={door => setTool({ ...tool, door })}
              >
                <span className="text-sm text-ink-muted">
                  Put a door where it meets a room
                </span>
              </Checkbox>
            </div>
          )}

          {mode === 'paint' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {MATERIALS.map((m, i) => {
                // The swatch picks the floor; how it goes on — brush, box
                // or fill — is the row's own choice and survives the pick.
                const chosen = floorOf(tool) === i;
                return (
                  <Button
                    key={m.key}
                    size="sm"
                    variant={chosen ? 'solid' : 'flat'}
                    color={chosen ? 'primary' : 'default'}
                    className="min-w-0 gap-1.5 px-2"
                    onPress={() => setTool(withFloor(tool, i))}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 rounded-sm border border-line"
                      style={{ background: dark ? m.swatchDark : m.swatch }}
                    />
                    {m.name}
                  </Button>
                );
              })}
              <span className="mx-1 h-5 w-px bg-line" />
              <BrushPicker brush={brush} onChange={setBrush} />
              {toolButton(
                'Box',
                { kind: 'rect', apply: 'material', value: floorOf(tool) },
                tool.kind === 'rect'
              )}
              {toolButton(
                'Fill',
                { kind: 'fill', material: floorOf(tool) },
                tool.kind === 'fill'
              )}
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
              <span className="mx-1 h-5 w-px bg-line" />
              <BrushPicker brush={brush} onChange={setBrush} />
              {toolButton(
                'Box up',
                { kind: 'rect', apply: 'elevation', value: 5 },
                tool.kind === 'rect' && tool.value > 0
              )}
              {toolButton(
                'Box down',
                { kind: 'rect', apply: 'elevation', value: -5 },
                tool.kind === 'rect' && tool.value < 0
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
              {doc && doc.levels.length > 1 && (
                <>
                  <span className="mx-1 h-5 w-px bg-line" />
                  {(['stairs', 'ladder'] as const).map(kind =>
                    toolButton(
                      LINK_LABEL[kind],
                      {
                        kind: 'link',
                        link: kind,
                        to:
                          tool.kind === 'link'
                            ? tool.to
                            : (doc.levels[
                                doc.levels.findIndex(l => l.id === terrain.id) +
                                  1
                              ]?.id ??
                              doc.levels[
                                doc.levels.findIndex(l => l.id === terrain.id) -
                                  1
                              ]?.id ??
                              terrain.id),
                      },
                      tool.kind === 'link' && tool.link === kind
                    )
                  )}
                  {tool.kind === 'link' && (
                    <Select
                      aria-label="Which floor it leads to"
                      size="sm"
                      className="w-44"
                      selectedKeys={[tool.to]}
                      onSelectionChange={keys => {
                        const key = String(Array.from(keys)[0] ?? '');
                        if (key) setTool({ ...tool, to: key });
                      }}
                    >
                      {[...doc.levels]
                        .reverse()
                        .filter(l => l.id !== terrain.id)
                        .map(l => (
                          <SelectItem key={l.id} textValue={l.name}>
                            {l.feet > terrain.feet ? 'Up to ' : 'Down to '}
                            {l.name.toLowerCase()} · {feetLabel(l.feet)}
                          </SelectItem>
                        ))}
                    </Select>
                  )}
                </>
              )}
              {doc && doc.levels.length === 1 && (
                <Marginalia dash>add a floor to draw stairs</Marginalia>
              )}
            </div>
          )}

          {mode === 'fog' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {toolButton('Reveal', { kind: 'reveal' }, tool.kind === 'reveal')}
              <BrushPicker brush={brush} onChange={setBrush} />
              {toolButton(
                'Box',
                { kind: 'rect', apply: 'reveal', value: 0 },
                tool.kind === 'rect'
              )}
              <Button
                size="sm"
                variant="light"
                className="text-ink-subtle"
                onPress={async () => {
                  const res = await resetFogAction(board.id, terrain.id);
                  if (!res.ok) onError(res.error);
                  await refresh();
                }}
              >
                {doc && doc.levels.length > 1
                  ? 'Hide this floor again'
                  : 'Fog it all'}
              </Button>
              {doc && doc.levels.length > 1 && (
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
                  Fog every floor
                </Button>
              )}
              {/* The light everywhere nothing else lights (08). Dark, and
                  "Reveal from the party" reads torches and darkvision. */}
              {terrain && (
                <div className="ml-2 inline-flex rounded-md border border-line bg-surface-2 p-0.5">
                  {(['bright', 'dim', 'dark'] as const).map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => saveLevel({ ...terrain, ambient: a })}
                      className={`rounded px-2 py-0.5 text-xs capitalize transition-colors ${
                        terrain.ambient === a
                          ? 'bg-gold font-medium text-bg'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
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

      {/* The offer (floors): a token that ends its move on the stairs is
          asked whether it takes them. The climb is priced beside the
          answer; "stay" keeps the offer away until something else is
          picked up. */}
      {stairsUnder && declinedLink !== stairsUnder.link.id && selectedToken && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink">
          <Glyph name="stairs" size={14} className="text-gold" />
          <span>
            {(selectedToken.entryId &&
              entriesById.get(selectedToken.entryId)?.label) ||
              selectedToken.label ||
              'Somebody'}{' '}
            is on {linkName(stairsUnder.link)}.
          </span>
          <span className="text-ink-muted">
            {stairsUnder.up ? 'It climbs' : 'It drops'} {stairsUnder.feet} ft of
            movement to {stairsUnder.otherPhrase}.
          </span>
          <Button
            size="sm"
            color="primary"
            className="h-7 min-w-0 px-2.5 text-xs"
            isDisabled={busy}
            onPress={() => climb()}
          >
            {stairsUnder.up ? 'Go up' : 'Go down'} to {stairsUnder.otherPhrase}
          </Button>
          <Button
            size="sm"
            variant="light"
            className="h-7 min-w-0 px-2.5 text-xs text-ink-subtle"
            onPress={() => setDeclinedLink(stairsUnder.link.id)}
          >
            Stay here
          </Button>
        </div>
      )}

      {/* The stairs picked (floors): what they are called, where they go,
          and whether the party has found them yet. Staff only. */}
      {isStaff &&
        doc &&
        selectedLink &&
        (() => {
          const link = doc.links.find(l => l.id === selectedLink);
          if (!link) return null;
          const lower = doc.levels.find(l => l.id === link.from);
          const upper = doc.levels.find(l => l.id === link.to);
          const write = (next: Partial<LevelLink>) =>
            scheduleSave({
              ...doc,
              links: doc.links.map(l =>
                l.id === link.id ? { ...l, ...next } : l
              ),
            });
          return (
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
              <Glyph name="stairs" size={13} className="text-gold" />
              <Input
                size="sm"
                aria-label="What the stairs are called"
                placeholder={
                  link.kind === 'ladder' ? 'The ladder' : 'The stairs'
                }
                className="w-40"
                classNames={{ inputWrapper: 'h-7 min-h-7' }}
                defaultValue={link.name ?? ''}
                onBlur={e => {
                  const v = e.currentTarget.value.trim();
                  if (v !== (link.name ?? '')) write({ name: v });
                }}
              />
              <span>
                {LINK_LABEL[link.kind]} · {link.w} × {link.h} tiles ·{' '}
                {lower?.name.toLowerCase() ?? '?'} (
                {feetLabel(lower?.feet ?? 0)}) to{' '}
                {upper?.name.toLowerCase() ?? '?'} (
                {feetLabel(upper?.feet ?? 0)})
              </span>
              <Marginalia dash>
                it stands on both floors; a token that ends its move on it is
                offered the other one
              </Marginalia>
              <Button
                size="sm"
                variant="flat"
                className="ml-auto h-7 min-w-0 px-2.5 text-xs"
                onPress={() => write({ hidden: !link.hidden })}
              >
                {link.hidden ? 'Let them find it' : 'Hide until found'}
              </Button>
              <Button
                size="sm"
                variant="light"
                className="h-7 min-w-0 px-2.5 text-xs text-ink-subtle"
                onPress={() => {
                  setSelectedLink(null);
                  scheduleSave({
                    ...doc,
                    links: doc.links.filter(l => l.id !== link.id),
                  });
                }}
              >
                Remove it
              </Button>
            </div>
          );
        })()}

      {litArea && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Glyph name="sparkle" size={13} className="text-arcane" />
          <span className="text-ink">
            {litArea.area.shape} · {litArea.area.size} ft
          </span>
          <span>
            {litArea.labels.length === 0
              ? 'nobody inside'
              : `${litArea.labels.length} inside: ${litArea.labels.join(', ')}`}
          </span>
          {areaPick?.pinned ? (
            <Marginalia dash>
              the shelf casts on them · tap again to clear
            </Marginalia>
          ) : (
            <Marginalia dash>tap to pin it</Marginalia>
          )}
        </div>
      )}

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
          {selectedIds.length > 1 && (
            <span className="rounded-sm border border-gold/50 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-gold-strong dark:text-gold">
              {selectedIds.length} together
            </span>
          )}
          {hoverToken && hoverToken.id !== selectedToken.id ? (
            // Range, by the table's diagonal rule. The question a table asks
            // most, answered without counting squares out loud.
            <span className="tabular-nums">
              {distanceFeet(selectedToken, hoverToken, state.rules.diagonals)}{' '}
              ft to{' '}
              {(hoverToken.entryId &&
                entriesById.get(hoverToken.entryId)?.label) ||
                hoverToken.label ||
                'that'}
            </span>
          ) : selectedToken.mine ? (
            <span>
              {selectedIds.length > 1
                ? 'Tap a tile and the group steps with it.'
                : selectedToken.entryId
                  ? speedOf(selectedToken) === 0
                    ? 'Cannot move this turn.'
                    : `Tap a lit tile to move there. ${speedOf(selectedToken)} ft${
                        selectedEntry &&
                        currentEntryIds.has(selectedEntry.id) &&
                        selectedEntry.turn.movedFeet > 0
                          ? ' left'
                          : ''
                      }.`
                  : 'Tap a tile to move it.'}
              {jumps && jumps.landings.length > 0 && (
                <span className="text-ink-subtle">
                  {' '}
                  A ringed tile is a jump — {jumps.long} ft with a run-up,{' '}
                  {jumps.standing} standing.
                </span>
              )}
            </span>
          ) : (
            <span>Not yours to move.</span>
          )}
          {/* The turn under the token: the same pips the card shows, so the
              board answers "has it acted" without a glance at the tracker. */}
          {selectedEntry && currentEntryIds.has(selectedEntry.id) && (
            <TurnStrip
              entry={selectedEntry}
              canSpend={isStaff || selectedToken.mine}
              isStaff={isStaff}
              refresh={refresh}
              onError={onError}
              compact
            />
          )}
          {selectedToken.entryId &&
            speedWhy(selectedToken).map(why => (
              <span key={why} className="text-xs text-warning">
                {why}
              </span>
            ))}
          {isStaff && state.encounter && selectedEntries.length > 0 && (
            <EffectPicker
              encounterId={state.encounter.id}
              entries={selectedEntries}
              others={state.entries
                .filter(e => !selectedEntries.some(s => s.id === e.id))
                .map(e => ({
                  id: e.id,
                  label: e.label,
                  conditionKeys: e.conditionKeys,
                }))}
              act={async p => {
                const res = await p;
                if (!res.ok) onError(res.error ?? 'Something went wrong.');
                await refresh();
              }}
              triggerLabel={
                selectedEntries.length > 1
                  ? `Afflict ${selectedEntries.length}`
                  : 'Afflict'
              }
            />
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
                    onPress={() => pick(selectedToken.id)}
                  >
                    Pick the lock
                  </Button>
                </Tooltip>
                {physicalDice && (
                  <FaceEntry
                    compact
                    sides={lockMode === 'straight' ? [20] : [20, 20]}
                    label="Pick the lock"
                    onSubmit={faces => pick(selectedToken.id, faces)}
                  />
                )}
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
          {isStaff && selectedToken.entryId === null && (
            <ThingEffectEditor
              campaignId={campaignId}
              token={selectedToken}
              terrain={doc ? levelOf(doc, selectedToken.level) : terrain}
              onDone={refresh}
            />
          )}
          {isStaff && selectedToken.entryId !== null && (
            <SightControls token={selectedToken} onDone={refresh} />
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
              {doc && doc.levels.length > 1 && (
                <Select
                  aria-label="Which floor it stands on"
                  size="sm"
                  className="w-40"
                  selectedKeys={[selectedToken.level]}
                  onSelectionChange={keys => {
                    const key = String(Array.from(keys)[0] ?? '');
                    if (!key || key === selectedToken.level) return;
                    void describe(selectedToken.id, { level: key });
                  }}
                >
                  {[...doc.levels].reverse().map(l => (
                    <SelectItem key={l.id} textValue={l.name}>
                      {l.name} · {feetLabel(l.feet)}
                    </SelectItem>
                  ))}
                </Select>
              )}
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

      {/* Elsewhere in the house (floors): everybody in the fight who is
          not on this floor, and the ways off it. One line each, so the
          board says where the wight is without a tab switch. */}
      {doc &&
        doc.levels.length > 1 &&
        (() => {
          const elsewhere = board.tokens.filter(
            t => t.level !== terrain.id && t.entryId
          );
          const exits = doc.links.filter(
            l =>
              (l.from === terrain.id || l.to === terrain.id) &&
              (!l.hidden || isStaff)
          );
          if (elsewhere.length === 0 && exits.length === 0) return null;
          return (
            <div className="flex flex-col gap-1 text-xs text-ink-muted">
              {elsewhere.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-ink-subtle">
                    Elsewhere in the house
                  </span>
                  {elsewhere.map(t => {
                    const entry = t.entryId
                      ? entriesById.get(t.entryId)
                      : undefined;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          pickLevel(t.level);
                          setSelected(t.id);
                        }}
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-2 w-2 rounded-full ${
                            entry?.side === 'foe'
                              ? 'bg-danger'
                              : entry?.side === 'party'
                                ? 'bg-gold'
                                : 'bg-ink-muted'
                          }`}
                        />
                        <span className="text-ink">
                          {entry?.label || t.label || 'Something'}
                        </span>
                        <span>· {levelPhrase(doc, t.level)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {exits.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-ink-subtle">Ways off this floor</span>
                  {exits.map(l => {
                    const otherId = linkOtherEnd(l, terrain.id)!;
                    const up = l.from === terrain.id;
                    return (
                      <span
                        key={l.id}
                        className="inline-flex items-center gap-1"
                      >
                        <Glyph
                          name={l.kind === 'ladder' ? 'ladder' : 'stairs'}
                          size={12}
                          className="text-gold"
                        />
                        <span className="text-ink">
                          {l.name?.trim() || LINK_LABEL[l.kind]}
                        </span>
                        <span>
                          · {up ? 'up' : 'down'} to {levelPhrase(doc, otherId)}
                          {l.hidden ? ' · hidden' : ''}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

      {isStaff && (
        <Marginalia dash>
          diagonals are five feet — 2024 dropped the zig-zag
        </Marginalia>
      )}
    </SectionCard>
  );
}
