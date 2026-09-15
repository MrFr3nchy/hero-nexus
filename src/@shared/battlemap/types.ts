/**
 * One authored battlefield.
 *
 * **Authored in 2D, rendered in 3D.** There is no 3D editor. A DM paints a tile
 * grid — elevation per tile, walls on tile edges, props at points — and any
 * renderer extrudes that grid into geometry. The 3D is a pure function of this
 * document, which makes it a *view*: cheap, replaceable, and unable to corrupt
 * the data. The 2D board is not a fallback; it is the authoring surface, and
 * it is what renders on a phone.
 *
 * Stored whole in `battle_maps.terrain` as JSON, the way `characters.sheet`
 * stores a `CharacterSheet` — a document read whole, written whole, never
 * queried by its interior. A 40×40 map is 1,600 tiles; as rows that is 1,600
 * inserts on every "fill this region with grass".
 *
 * **Not `campaign_maps`.** That is a region map: an uploaded picture with pins
 * on it, lore furniture. Different lifetime, different scale, different
 * permissions. Nothing here extends it.
 *
 * Row-major throughout: `index = y * w + x`.
 */

export const BATTLEMAP_FORMAT = 'hero-nexus.battlemap' as const;
export const BATTLEMAP_VERSION = 1 as const;

/** Feet per tile. D&D's grid, and the unit every rule below thinks in. */
export const TILE_FEET = 5;

/** Board bounds. Below 4 there is nothing to fight over; above 60 the canvas hurts. */
export const MIN_SIDE = 4;
export const MAX_SIDE = 60;

export interface TerrainDoc {
  format: typeof BATTLEMAP_FORMAT;
  version: typeof BATTLEMAP_VERSION;
  w: number;
  h: number;
  /** Feet above the datum, per tile. Integers; D&D thinks in 5s but 1s are legal. */
  elevation: number[];
  /** Index into `MATERIALS`, per tile. 0 is void: no floor, nothing to stand on. */
  material: number[];
  /** Walls sit on the edge between two tiles, never on a tile. Decision 2. */
  walls: Wall[];
  props: Prop[];
  /** Warm points. The palette is candlelight; lean into it. */
  lights: Light[];
  /**
   * The light everywhere nothing else lights (improvements 08). Bright is
   * the default and how every board before it behaved: a party reveals what
   * it can see. Dark: only a light's radius or a token's own vision reveals.
   */
  ambient: Ambient;
}

export type Ambient = 'bright' | 'dim' | 'dark';
export const AMBIENTS: readonly Ambient[] = ['bright', 'dim', 'dark'];

export type Side = 'n' | 'e' | 's' | 'w';
export type WallKind = 'solid' | 'door' | 'window' | 'rail';

/**
 * A wall on one edge of one tile.
 *
 * The edge between `(x, y)` and its neighbour to `side`. A wall on the north
 * edge of `(3, 4)` and one on the south edge of `(3, 3)` are the same edge —
 * `edgeKey` folds them together so a document cannot carry both.
 */
export interface Wall {
  x: number;
  y: number;
  side: Side;
  kind: WallKind;
  /** Feet. A rail is 3, a wall is 10, a cliff face is whatever the drop is. */
  height: number;
  /** Doors only. A closed door blocks sight and movement; an open one blocks neither. */
  open?: boolean;
}

export type PropKind =
  | 'table'
  | 'chest'
  | 'barrel'
  | 'pillar'
  | 'tree'
  | 'rubble'
  | 'altar'
  | 'statue'
  /**
   * A picture standing up: one of the campaign's images as a paper standee
   * on the tile — a tree the DM drew, a statue, a door. The-sand-table's
   * phase 6. Carries `imageId` and `height`; the other kinds carry neither.
   */
  | 'image';

/** A thing standing on a tile that is not a combatant. */
export interface Prop {
  x: number;
  y: number;
  kind: PropKind;
  /** Whether it stops a token standing on its tile. A pillar does; rubble does not. */
  blocks: boolean;
  /** `image` only: a `campaign_images` id. Referenced, never copied. */
  imageId?: string;
  /** `image` only: feet tall. A tree is 20, a door 10, a mile-marker 3. */
  height?: number;
  /**
   * `image` only: which way it faces. Absent, it turns to face the camera —
   * right for a tree; a signpost or a wall panel names a side and stands
   * still.
   */
  facing?: Facing;
}

/** Camera-facing, or fixed to a compass side. */
export type Facing = 'camera' | 'n' | 'e' | 's' | 'w';
export const FACINGS: readonly Facing[] = ['camera', 'n', 'e', 's', 'w'];

/** Whether a thing in this state still takes up its tile. */
export function blocksTile(state: ItemState | null | undefined): boolean {
  return state !== 'open' && state !== 'broken';
}

/**
 * Whether a token stops a creature standing on its tile: a closed thing
 * does; an open or broken one does not; and a thing that goes off when
 * stepped on (08) never does — a pressure plate you cannot step on is not a
 * pressure plate. `effect` is the stored `ThingEffect`, or anything else.
 */
export function blocksStanding(token: {
  state: ItemState | null | undefined;
  effect?: unknown;
}): boolean {
  if (!blocksTile(token.state)) return false;
  const e = token.effect as { trigger?: unknown } | null | undefined;
  return !(e && typeof e === 'object' && e.trigger === 'enter');
}

/** What a thing on the board can be. Open and broken things do not block. */
export type ItemState = 'open' | 'closed' | 'locked' | 'broken';
export const ITEM_STATES: readonly ItemState[] = [
  'open',
  'closed',
  'locked',
  'broken',
];

/** A point light. Braziers, torches, the glow under a door. */
export interface Light {
  x: number;
  y: number;
  /** Feet. How far the warmth reaches. */
  radius: number;
}

/* --- materials --------------------------------------------------------- */

export interface Material {
  key: string;
  /** Two words at most. It is a swatch label. */
  name: string;
  /** 2D swatch. Light palette; the board reads its dark twin off the tokens. */
  swatch: string;
  swatchDark: string;
  /** Costs double to enter. 2024 PHB, "Difficult Terrain". */
  difficult: boolean;
  /** Cannot be stood on at all. Water you swim; lava you do not. */
  impassable: boolean;
}

/**
 * The floor vocabulary.
 *
 * **APPEND ONLY. NEVER REORDER.** Every saved map holds *indices* into this
 * array — `material[i]` is a position here, not a key — and reordering it
 * silently repaints every battlefield anybody has ever drawn. Index 0 is void
 * and must stay index 0: the fog filter writes it over everything a player has
 * not been shown, and "unrevealed" has to be the same number everywhere.
 */
export const MATERIALS: readonly Material[] = [
  {
    key: 'void',
    name: 'Nothing',
    swatch: '#faf6ef',
    swatchDark: '#16130f',
    difficult: false,
    impassable: true,
  },
  {
    key: 'stone',
    name: 'Stone',
    swatch: '#d9d2c3',
    swatchDark: '#3a342b',
    difficult: false,
    impassable: false,
  },
  {
    key: 'dirt',
    name: 'Dirt',
    swatch: '#cdbba0',
    swatchDark: '#4a3d2c',
    difficult: false,
    impassable: false,
  },
  {
    key: 'grass',
    name: 'Grass',
    swatch: '#b9c9a3',
    swatchDark: '#3b4a2e',
    difficult: false,
    impassable: false,
  },
  {
    key: 'wood',
    name: 'Boards',
    swatch: '#d4b58c',
    swatchDark: '#5a4328',
    difficult: false,
    impassable: false,
  },
  {
    key: 'water',
    name: 'Water',
    swatch: '#a9bfd0',
    swatchDark: '#2c3f52',
    difficult: true,
    impassable: false,
  },
  {
    key: 'rubble',
    name: 'Rubble',
    swatch: '#c2b6a6',
    swatchDark: '#4d4237',
    difficult: true,
    impassable: false,
  },
  {
    key: 'lava',
    name: 'Lava',
    swatch: '#d98a6c',
    swatchDark: '#6b2f22',
    difficult: false,
    impassable: true,
  },
] as const;

export const VOID = 0;

export function materialAt(doc: TerrainDoc, x: number, y: number): Material {
  return MATERIALS[doc.material[y * doc.w + x] ?? VOID] ?? MATERIALS[VOID];
}

/* --- geometry helpers, pure ------------------------------------------- */

export function inBounds(doc: TerrainDoc, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < doc.w &&
    y < doc.h
  );
}

export function indexOf(doc: TerrainDoc, x: number, y: number): number {
  return y * doc.w + x;
}

/**
 * The one name an edge has.
 *
 * `(3,4,'n')` and `(3,3,'s')` are the same edge. Both normalise to the
 * northern/western tile's view of it, so a document cannot carry a solid wall
 * and an open door on the same seam and have them disagree.
 */
export function edgeKey(x: number, y: number, side: Side): string {
  switch (side) {
    case 'n':
      return `${x},${y - 1}|${x},${y}`;
    case 's':
      return `${x},${y}|${x},${y + 1}`;
    case 'w':
      return `${x - 1},${y}|${x},${y}`;
    case 'e':
      return `${x},${y}|${x + 1},${y}`;
  }
}

/** The tile on the other side of an edge. May be out of bounds. */
export function across(x: number, y: number, side: Side): [number, number] {
  switch (side) {
    case 'n':
      return [x, y - 1];
    case 's':
      return [x, y + 1];
    case 'w':
      return [x - 1, y];
    case 'e':
      return [x + 1, y];
  }
}

/**
 * An empty board: one material everywhere, no walls. What a new map starts
 * as. All void by default; a DM laying out a stone hall picks stone and
 * paints the void back in where it belongs, which is less painting.
 */
export function emptyTerrain(
  w: number,
  h: number,
  fill: number = VOID
): TerrainDoc {
  const side = (n: number) => Math.max(MIN_SIDE, Math.min(MAX_SIDE, n | 0));
  const W = side(w);
  const H = side(h);
  const material = MATERIALS[fill] ? fill : VOID;
  return {
    format: BATTLEMAP_FORMAT,
    version: BATTLEMAP_VERSION,
    w: W,
    h: H,
    elevation: new Array(W * H).fill(0),
    material: new Array(W * H).fill(material),
    ambient: 'bright',
    walls: [],
    props: [],
    lights: [],
  };
}

/**
 * Coerce a stored document into one this build can draw.
 *
 * Arrays are resized to `w * h` — truncated or padded with void — rather than
 * trusted, so a row somebody edited by hand cannot crash a renderer with an
 * index off the end. Walls, props and lights outside the board are dropped.
 * Same posture `normalizeLayout` takes with a screen layout.
 */
export function normalizeTerrain(raw: unknown): TerrainDoc {
  const src = (raw ?? {}) as Partial<TerrainDoc>;
  const base = emptyTerrain(
    Number(src.w) || MIN_SIDE,
    Number(src.h) || MIN_SIDE
  );
  const n = base.w * base.h;

  const ints = (arr: unknown, fill: number): number[] => {
    const out = new Array(n).fill(fill);
    if (!Array.isArray(arr)) return out;
    for (let i = 0; i < Math.min(n, arr.length); i++) {
      const v = Number(arr[i]);
      out[i] = Number.isFinite(v) ? Math.trunc(v) : fill;
    }
    return out;
  };

  const material = ints(src.material, VOID).map(m =>
    m >= 0 && m < MATERIALS.length ? m : VOID
  );

  const seen = new Set<string>();
  const walls: Wall[] = [];
  for (const w of Array.isArray(src.walls) ? src.walls : []) {
    if (!w || !inBounds(base, Number(w.x), Number(w.y))) continue;
    if (!['n', 'e', 's', 'w'].includes(w.side)) continue;
    if (!['solid', 'door', 'window', 'rail'].includes(w.kind)) continue;
    const key = edgeKey(Number(w.x), Number(w.y), w.side);
    if (seen.has(key)) continue;
    seen.add(key);
    walls.push({
      x: Number(w.x),
      y: Number(w.y),
      side: w.side,
      kind: w.kind,
      height: Math.max(0, Math.trunc(Number(w.height)) || 0),
      ...(w.kind === 'door' ? { open: Boolean(w.open) } : {}),
    });
  }

  const props: Prop[] = [];
  for (const p of Array.isArray(src.props) ? src.props : []) {
    if (!p || !inBounds(base, Number(p.x), Number(p.y))) continue;
    // An image prop with no image is a tile with nothing on it.
    if (p.kind === 'image' && typeof p.imageId !== 'string') continue;
    props.push({
      x: Number(p.x),
      y: Number(p.y),
      kind: p.kind,
      blocks: Boolean(p.blocks),
      ...(p.kind === 'image'
        ? {
            imageId: String(p.imageId).slice(0, 64),
            height: Math.max(
              1,
              Math.min(100, Math.trunc(Number(p.height)) || 10)
            ),
            ...((FACINGS as readonly unknown[]).includes(p.facing) &&
            p.facing !== 'camera'
              ? { facing: p.facing as Facing }
              : {}),
          }
        : {}),
    });
  }

  const lights: Light[] = [];
  for (const l of Array.isArray(src.lights) ? src.lights : []) {
    if (!l || !inBounds(base, Number(l.x), Number(l.y))) continue;
    lights.push({
      x: Number(l.x),
      y: Number(l.y),
      radius: Math.max(5, Math.trunc(Number(l.radius)) || 15),
    });
  }

  return {
    ...base,
    elevation: ints(src.elevation, 0),
    material,
    walls,
    props,
    lights,
    ambient: (AMBIENTS as readonly unknown[]).includes(src.ambient)
      ? (src.ambient as Ambient)
      : 'bright',
  };
}

/* --- things that do something (improvements 08) ---------------------------- */

/** One thing a thing changes when it fires. Tiles are indices into the doc. */
export type ThingChange =
  | { kind: 'material'; tiles: number[]; to: number }
  | { kind: 'elevation'; tiles: number[]; to: number }
  | { kind: 'wall'; edge: string; to: WallKind | 'none'; open?: boolean }
  | { kind: 'thing'; tokenId: string; to: ItemState }
  | { kind: 'reveal'; tiles: number[] }
  | {
      kind: 'damage';
      area: number[];
      dice: string;
      type: string;
      save?: { ability: string; dc: number; effect: 'half' | 'negates' };
    }
  | {
      kind: 'condition';
      area: number[];
      condition: string;
      rounds: number | null;
      save?: { ability: string; dc: number };
    }
  | { kind: 'sound'; text: string };

export type ThingTrigger = 'operate' | 'enter' | 'damage' | 'destroy';

/**
 * What a thing does when it is used, stepped on, struck or destroyed. A
 * lever that opens a portcullis, a plate that drops the floor, a dam that
 * breaks. `undo` is what a `toggle` remembers so the second pull puts it back.
 */
export interface ThingEffect {
  trigger: ThingTrigger;
  /** Fires once and is then spent, toggles back and forth, or fires every time. */
  repeat: 'once' | 'toggle' | 'always';
  spent?: boolean;
  /** Who sets it off when the trigger is `enter`. */
  triggers: 'anyone' | 'party' | 'foe';
  /** Hidden until found: a Perception DC. Absent = in plain sight. */
  findDc?: number;
  changes: ThingChange[];
  /** For `toggle`: the changes that put the last firing back. */
  undo?: ThingChange[];
}

const TRIGGERS: readonly ThingTrigger[] = [
  'operate',
  'enter',
  'damage',
  'destroy',
];

/** Read a stored effect, dropping anything malformed. Null for none. */
export function normalizeThingEffect(raw: unknown): ThingEffect | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!TRIGGERS.includes(r.trigger as ThingTrigger)) return null;
  const tiles = (v: unknown) =>
    Array.isArray(v)
      ? v
          .map(Number)
          .filter(n => Number.isInteger(n) && n >= 0)
          .slice(0, 4000)
      : [];
  const change = (c: unknown): ThingChange | null => {
    if (!c || typeof c !== 'object') return null;
    const x = c as Record<string, unknown>;
    switch (x.kind) {
      case 'material':
        return {
          kind: 'material',
          tiles: tiles(x.tiles),
          to: Math.trunc(Number(x.to)) || 0,
        };
      case 'elevation':
        return {
          kind: 'elevation',
          tiles: tiles(x.tiles),
          to: Math.trunc(Number(x.to)) || 0,
        };
      case 'wall':
        return typeof x.edge === 'string' &&
          ['solid', 'door', 'window', 'rail', 'none'].includes(String(x.to))
          ? {
              kind: 'wall',
              edge: x.edge,
              to: x.to as WallKind | 'none',
              ...(x.open !== undefined ? { open: Boolean(x.open) } : {}),
            }
          : null;
      case 'thing':
        return typeof x.tokenId === 'string' &&
          ITEM_STATES.includes(x.to as ItemState)
          ? { kind: 'thing', tokenId: x.tokenId, to: x.to as ItemState }
          : null;
      case 'reveal':
        return { kind: 'reveal', tiles: tiles(x.tiles) };
      case 'damage': {
        const save = x.save as Record<string, unknown> | undefined;
        return typeof x.dice === 'string'
          ? {
              kind: 'damage',
              area: tiles(x.area),
              dice: x.dice.slice(0, 40),
              type: String(x.type ?? 'bludgeoning').slice(0, 20),
              ...(save && typeof save.ability === 'string'
                ? {
                    save: {
                      ability: save.ability,
                      dc: Math.max(
                        1,
                        Math.min(40, Math.trunc(Number(save.dc)) || 10)
                      ),
                      effect: save.effect === 'negates' ? 'negates' : 'half',
                    },
                  }
                : {}),
            }
          : null;
      }
      case 'condition': {
        const save = x.save as Record<string, unknown> | undefined;
        return typeof x.condition === 'string'
          ? {
              kind: 'condition',
              area: tiles(x.area),
              condition: x.condition.slice(0, 30),
              rounds:
                x.rounds === null || x.rounds === undefined
                  ? null
                  : Math.max(1, Math.trunc(Number(x.rounds)) || 1),
              ...(save && typeof save.ability === 'string'
                ? {
                    save: {
                      ability: save.ability,
                      dc: Math.max(
                        1,
                        Math.min(40, Math.trunc(Number(save.dc)) || 10)
                      ),
                    },
                  }
                : {}),
            }
          : null;
      }
      case 'sound':
        return typeof x.text === 'string'
          ? { kind: 'sound', text: x.text.slice(0, 200) }
          : null;
      default:
        return null;
    }
  };
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map(change)
      .filter((c): c is ThingChange => c !== null)
      .slice(0, 40);
  const findDc = Number(r.findDc);
  return {
    trigger: r.trigger as ThingTrigger,
    repeat: r.repeat === 'toggle' || r.repeat === 'always' ? r.repeat : 'once',
    ...(r.spent === true ? { spent: true } : {}),
    triggers:
      r.triggers === 'party' || r.triggers === 'foe' ? r.triggers : 'anyone',
    ...(Number.isFinite(findDc) && findDc > 0
      ? { findDc: Math.min(40, Math.trunc(findDc)) }
      : {}),
    changes: list(r.changes),
    ...(Array.isArray(r.undo) ? { undo: list(r.undo) } : {}),
  };
}
