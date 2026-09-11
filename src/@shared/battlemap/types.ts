/**
 * One authored battlefield.
 *
 * **Authored in 2D, rendered in 3D.** There is no 3D editor. A DM paints a tile
 * grid — elevation per tile, walls on tile edges, props at points — and any
 * renderer extrudes that grid into geometry. The 3D is a pure function of this
 * document, which makes it a *view*: cheap, replaceable, and unable to corrupt
 * the data. The 2D board is not a fallback; it is the authoring surface, and
 * it is what renders on a phone. See `docs/handoff/the-sand-table/README.md`,
 * decision 1.
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
}

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
}

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

/** An empty board: all void, no walls. What a new map starts as. */
export function emptyTerrain(w: number, h: number): TerrainDoc {
  const side = (n: number) => Math.max(MIN_SIDE, Math.min(MAX_SIDE, n | 0));
  const W = side(w);
  const H = side(h);
  return {
    format: BATTLEMAP_FORMAT,
    version: BATTLEMAP_VERSION,
    w: W,
    h: H,
    elevation: new Array(W * H).fill(0),
    material: new Array(W * H).fill(VOID),
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
  };
}
