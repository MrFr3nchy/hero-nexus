/**
 * The workshop's edits, as arithmetic on a floor.
 *
 * Every tool on the sand table's workshop — the floor brush, a run of
 * wall, a room, a scattering of trees, a stamp, a box of the board picked
 * up and put down on the floor above — is a function from one floor
 * document to the next. Pure, like `battlemap.ts` beside it: no React, no
 * canvas, no database, so each tool can be asserted apart from the app and
 * the same function serves the workshop and the board on the screen.
 *
 * Everything returns a new document. The one the caller passed is never
 * touched, so an undo is the document it had before.
 */
import {
  edgeKey,
  inBounds,
  MATERIALS,
  VOID,
  WALL_HEIGHT,
  type Facing,
  type Light,
  type LinkKind,
  type Prop,
  type PropKind,
  type Room,
  type Side,
  type TerrainDoc,
  type Wall,
  type WallKind,
} from '@/@shared/battlemap/types';
import { floodFill, rectTiles, wallIndex, type Tile } from './battlemap';

/** A copy with the arrays the edit will write unshared. */
function open(doc: TerrainDoc): TerrainDoc {
  return {
    ...doc,
    elevation: [...doc.elevation],
    material: [...doc.material],
    walls: doc.walls.map(w => ({ ...w })),
    props: doc.props.map(p => ({ ...p })),
    lights: doc.lights.map(l => ({ ...l })),
    ...(doc.rooms ? { rooms: doc.rooms.map(r => ({ ...r })) } : {}),
  };
}

/** The lowest and highest a tile may be, in feet. */
export const MIN_HEIGHT = -50;
export const MAX_HEIGHT = 200;

/* --- floor and height ----------------------------------------------------- */

export function paintTiles(
  doc: TerrainDoc,
  tiles: readonly number[],
  material: number
): TerrainDoc {
  const m = MATERIALS[material] ? material : VOID;
  const next = open(doc);
  for (const i of tiles)
    if (i >= 0 && i < next.material.length) next.material[i] = m;
  return next;
}

/** Repaint the room `at` sits in: every connected tile of the same floor. */
export function fillFrom(
  doc: TerrainDoc,
  at: Tile,
  material: number
): TerrainDoc {
  return paintTiles(doc, floodFill(doc, at), material);
}

export function raiseTiles(
  doc: TerrainDoc,
  tiles: readonly number[],
  byFeet: number
): TerrainDoc {
  const next = open(doc);
  for (const i of tiles) {
    if (i < 0 || i >= next.elevation.length) continue;
    next.elevation[i] = Math.max(
      MIN_HEIGHT,
      Math.min(MAX_HEIGHT, next.elevation[i] + byFeet)
    );
  }
  return next;
}

export function setHeight(
  doc: TerrainDoc,
  tiles: readonly number[],
  feet: number
): TerrainDoc {
  const next = open(doc);
  const v = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, feet));
  for (const i of tiles)
    if (i >= 0 && i < next.elevation.length) next.elevation[i] = v;
  return next;
}

/* --- walls ---------------------------------------------------------------- */

function wallOf(x: number, y: number, side: Side, kind: WallKind): Wall {
  return {
    x,
    y,
    side,
    kind,
    height: WALL_HEIGHT[kind],
    ...(kind === 'door' ? { open: false } : {}),
  };
}

/** One edge takes this kind, whatever stood there. */
export function setWall(
  doc: TerrainDoc,
  x: number,
  y: number,
  side: Side,
  kind: WallKind
): TerrainDoc {
  if (!inBounds(doc, x, y)) return doc;
  const key = edgeKey(x, y, side);
  const next = open(doc);
  next.walls = next.walls.filter(w => edgeKey(w.x, w.y, w.side) !== key);
  next.walls.push(wallOf(x, y, side, kind));
  return next;
}

export function eraseWall(
  doc: TerrainDoc,
  x: number,
  y: number,
  side: Side
): TerrainDoc {
  const key = edgeKey(x, y, side);
  const next = open(doc);
  next.walls = next.walls.filter(w => edgeKey(w.x, w.y, w.side) !== key);
  return next.walls.length === doc.walls.length ? doc : next;
}

/**
 * A run of wall along one grid line: from the edge the drag started on,
 * straight to where it ended. A drag that starts on a tile's north edge
 * and moves east lays wall along that row's top; one that starts on a
 * west edge and moves south lays it down that column.
 */
export function wallRun(
  doc: TerrainDoc,
  from: { x: number; y: number; side: Side },
  to: Tile,
  kind: WallKind
): TerrainDoc {
  const next = open(doc);
  const walls = wallIndex(next);
  const put = (x: number, y: number, side: Side) => {
    if (!inBounds(doc, x, y)) return;
    const key = edgeKey(x, y, side);
    next.walls = next.walls.filter(w => edgeKey(w.x, w.y, w.side) !== key);
    const wall = wallOf(x, y, side, kind);
    next.walls.push(wall);
    walls.set(key, wall);
  };
  if (from.side === 'n' || from.side === 's') {
    const x0 = Math.min(from.x, to.x);
    const x1 = Math.max(from.x, to.x);
    for (let x = x0; x <= x1; x++) put(x, from.y, from.side);
  } else {
    const y0 = Math.min(from.y, to.y);
    const y1 = Math.max(from.y, to.y);
    for (let y = y0; y <= y1; y++) put(from.x, y, from.side);
  }
  return next;
}

/** Wall round the outside of a box. Existing walls on the perimeter are replaced. */
export function wallOutline(
  doc: TerrainDoc,
  a: Tile,
  b: Tile,
  kind: WallKind
): TerrainDoc {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const x1 = Math.min(doc.w - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const y1 = Math.min(doc.h - 1, Math.max(a.y, b.y));
  let next = doc;
  for (let x = x0; x <= x1; x++) {
    next = setWall(next, x, y0, 'n', kind);
    next = setWall(next, x, y1, 's', kind);
  }
  for (let y = y0; y <= y1; y++) {
    next = setWall(next, x0, y, 'w', kind);
    next = setWall(next, x1, y, 'e', kind);
  }
  return next;
}

/** Every wall on any edge of these tiles comes down. */
export function knockDown(
  doc: TerrainDoc,
  tiles: readonly number[]
): TerrainDoc {
  const set = new Set(tiles);
  const next = open(doc);
  next.walls = next.walls.filter(w => {
    const here = w.y * doc.w + w.x;
    if (set.has(here)) return false;
    const [ax, ay] = acrossOf(w.x, w.y, w.side);
    return !(inBounds(doc, ax, ay) && set.has(ay * doc.w + ax));
  });
  return next;
}

function acrossOf(x: number, y: number, side: Side): [number, number] {
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

/* --- things on tiles -------------------------------------------------------- */

/** Put a prop on a tile, or take the one there away. */
export function toggleProp(
  doc: TerrainDoc,
  x: number,
  y: number,
  prop: Omit<Prop, 'x' | 'y'>
): TerrainDoc {
  if (!inBounds(doc, x, y)) return doc;
  const next = open(doc);
  const at = next.props.findIndex(p => p.x === x && p.y === y);
  if (at >= 0) next.props.splice(at, 1);
  else next.props.push({ x, y, ...prop });
  return next;
}

/**
 * Put a picture standing on a tile, replacing whatever prop was there.
 *
 * Not `toggleProp`: a second tap with a different picture should swap the
 * standee, not take the first one away and leave the tile bare.
 */
export function putPicture(
  doc: TerrainDoc,
  x: number,
  y: number,
  picture: { imageId: string; height: number; facing?: Facing; blocks: boolean }
): TerrainDoc {
  if (!inBounds(doc, x, y)) return doc;
  const next = open(doc);
  const at = next.props.findIndex(p => p.x === x && p.y === y);
  const prop: Prop = {
    x,
    y,
    kind: 'image',
    blocks: picture.blocks,
    imageId: picture.imageId,
    height: Math.max(1, Math.min(100, Math.trunc(picture.height) || 10)),
    ...(picture.facing && picture.facing !== 'camera'
      ? { facing: picture.facing }
      : {}),
  };
  if (at >= 0) next.props[at] = prop;
  else next.props.push(prop);
  return next;
}

/** What `eraseTiles` rubs out. One kind, so the floor survives the hedge. */
export type EraseKind =
  | 'props'
  | 'walls'
  | 'lights'
  | 'floor'
  | 'height'
  | 'all';

/**
 * Rub out one kind of thing over a set of tiles.
 *
 * The reason this exists: removing a tree, a hedge or a wall used to mean
 * `clearRegion`, which takes the floor, the height, the walls, the props and
 * the lights together — so a DM who wanted the hedge gone lost the lawn it
 * stood on and had to repaint it. Each kind is its own verb now, and
 * `'all'` is still there for the DM who did mean the whole tile.
 *
 * Walls count as "on" a tile when either side of the edge is in the set, so
 * dragging along the inside of a room knocks its walls down without needing
 * to drag over the tiles outside it.
 */
export function eraseTiles(
  doc: TerrainDoc,
  tiles: readonly number[],
  kind: EraseKind
): TerrainDoc {
  const set = new Set(tiles);
  if (kind === 'all') {
    let next = paintTiles(doc, tiles, VOID);
    next = setHeight(next, tiles, 0);
    next = knockDown(next, tiles);
    next.props = next.props.filter(p => !set.has(p.y * doc.w + p.x));
    next.lights = next.lights.filter(l => !set.has(l.y * doc.w + l.x));
    if (next.rooms) {
      next.rooms = next.rooms.filter(r => !set.has(r.y * doc.w + r.x));
    }
    return next;
  }
  if (kind === 'floor') return paintTiles(doc, tiles, VOID);
  if (kind === 'height') return setHeight(doc, tiles, 0);
  if (kind === 'walls') return knockDown(doc, tiles);

  const next = open(doc);
  if (kind === 'props') {
    next.props = next.props.filter(p => !set.has(p.y * doc.w + p.x));
  } else {
    next.lights = next.lights.filter(l => !set.has(l.y * doc.w + l.x));
  }
  return next;
}

export function toggleLight(
  doc: TerrainDoc,
  x: number,
  y: number,
  radius: number
): TerrainDoc {
  if (!inBounds(doc, x, y)) return doc;
  const next = open(doc);
  const at = next.lights.findIndex(l => l.x === x && l.y === y);
  if (at >= 0) next.lights.splice(at, 1);
  else next.lights.push({ x, y, radius });
  return next;
}

/* --- scatter ---------------------------------------------------------------- */

export type ScatterKind = Extract<
  PropKind,
  'tree' | 'pine' | 'bush' | 'boulder' | 'rubble' | 'mushroom'
>;
export type Density = 'sparse' | 'some' | 'thick';
export const DENSITY_SHARE: Record<Density, number> = {
  sparse: 0.12,
  some: 0.24,
  thick: 0.4,
};

/** A small seeded generator, so a stroke is the same stroke on replay. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Trees grow where it is empty. Of the brushed tiles, the share the
 * density asks for — never one that already has a prop or a light, never
 * one a token could not stand on, and with `avoid`, never a laid floor
 * (boards, stone) or a tile with a wall on any edge: the garden, not the
 * hall. `vary` gives each a size between 0.8 and 1.2.
 */
export function scatter(
  doc: TerrainDoc,
  tiles: readonly number[],
  kind: ScatterKind,
  density: Density,
  opts: { blocks: boolean; vary: boolean; avoid: boolean },
  rnd: () => number = Math.random
): TerrainDoc {
  const taken = new Set<number>();
  for (const p of doc.props) taken.add(p.y * doc.w + p.x);
  for (const l of doc.lights) taken.add(l.y * doc.w + l.x);
  const walled = new Set<number>();
  if (opts.avoid) {
    for (const w of doc.walls) {
      walled.add(w.y * doc.w + w.x);
      const [ax, ay] = acrossOf(w.x, w.y, w.side);
      if (inBounds(doc, ax, ay)) walled.add(ay * doc.w + ax);
    }
  }
  const laid = new Set(['stone', 'wood']);
  const free = tiles.filter(i => {
    if (taken.has(i)) return false;
    const m = MATERIALS[doc.material[i] ?? VOID];
    if (!m || m.key === 'void' || m.impassable) return false;
    if (opts.avoid && (laid.has(m.key) || walled.has(i))) return false;
    return true;
  });
  const want = Math.round(DENSITY_SHARE[density] * tiles.length);
  if (want === 0 || free.length === 0) return doc;
  // Shuffle the free tiles and take the first `want`.
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const next = open(doc);
  for (const i of free.slice(0, want)) {
    next.props.push({
      x: i % doc.w,
      y: Math.floor(i / doc.w),
      kind,
      blocks: opts.blocks,
      ...(opts.vary
        ? { scale: Math.round((0.8 + rnd() * 0.4) * 100) / 100 }
        : {}),
    });
  }
  return next;
}

/* --- fragments: stamps, and the select tool's box ---------------------------- */

/**
 * A piece of a floor that can be put down somewhere else: what a stamp
 * is, and what the Select tool picks up. Tiles are relative to its own
 * top-left; a null material or height leaves the floor as it was.
 */
export interface Fragment {
  w: number;
  h: number;
  material: (number | null)[];
  elevation: (number | null)[];
  walls: Wall[];
  props: Prop[];
  lights: Light[];
  rooms: Room[];
  /** Stairs the fragment carries, to be linked to the floor above. */
  link?: { kind: LinkKind; x: number; y: number; w: number; h: number };
}

/** Pick up a box of the floor. Walls on the box's tiles come with it. */
export function cutRegion(doc: TerrainDoc, a: Tile, b: Tile): Fragment {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const x1 = Math.min(doc.w - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const y1 = Math.min(doc.h - 1, Math.max(a.y, b.y));
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const inside = (x: number, y: number) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const material: (number | null)[] = [];
  const elevation: (number | null)[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      material.push(doc.material[y * doc.w + x] ?? VOID);
      elevation.push(doc.elevation[y * doc.w + x] ?? 0);
    }
  }
  return {
    w,
    h,
    material,
    elevation,
    walls: doc.walls
      .filter(wl => inside(wl.x, wl.y))
      .map(wl => ({ ...wl, x: wl.x - x0, y: wl.y - y0 })),
    props: doc.props
      .filter(p => inside(p.x, p.y))
      .map(p => ({ ...p, x: p.x - x0, y: p.y - y0 })),
    lights: doc.lights
      .filter(l => inside(l.x, l.y))
      .map(l => ({ ...l, x: l.x - x0, y: l.y - y0 })),
    rooms: (doc.rooms ?? [])
      .filter(r => inside(r.x, r.y))
      .map(r => ({ ...r, x: r.x - x0, y: r.y - y0 })),
  };
}

/** The box, emptied: void floor, no walls, nothing standing. */
export function clearRegion(doc: TerrainDoc, a: Tile, b: Tile): TerrainDoc {
  const tiles = rectTiles(doc, a, b);
  const set = new Set(tiles);
  let next = paintTiles(doc, tiles, VOID);
  next = setHeight(next, tiles, 0);
  next = knockDown(next, tiles);
  next.props = next.props.filter(p => !set.has(p.y * doc.w + p.x));
  next.lights = next.lights.filter(l => !set.has(l.y * doc.w + l.x));
  if (next.rooms) {
    next.rooms = next.rooms.filter(r => !set.has(r.y * doc.w + r.x));
  }
  return next;
}

/**
 * Put a fragment down with its top-left on a tile. Walls on the edges it
 * covers are replaced; props and lights already on its tiles are kept
 * beside the new ones only if the fragment leaves the tile alone.
 */
export function pasteFragment(
  doc: TerrainDoc,
  frag: Fragment,
  at: Tile
): TerrainDoc {
  const next = open(doc);
  const covered = new Set<number>();
  for (let y = 0; y < frag.h; y++) {
    for (let x = 0; x < frag.w; x++) {
      const tx = at.x + x;
      const ty = at.y + y;
      if (!inBounds(doc, tx, ty)) continue;
      const i = ty * doc.w + tx;
      const m = frag.material[y * frag.w + x];
      const e = frag.elevation[y * frag.w + x];
      if (m !== null && m !== undefined) {
        next.material[i] = MATERIALS[m] ? m : VOID;
        covered.add(i);
      }
      if (e !== null && e !== undefined) next.elevation[i] = e;
    }
  }
  const keys = new Set(
    frag.walls.map(w => edgeKey(w.x + at.x, w.y + at.y, w.side))
  );
  next.walls = next.walls.filter(w => !keys.has(edgeKey(w.x, w.y, w.side)));
  for (const w of frag.walls) {
    const x = w.x + at.x;
    const y = w.y + at.y;
    if (inBounds(doc, x, y)) next.walls.push({ ...w, x, y });
  }
  const standing = new Set<number>();
  for (const p of frag.props) standing.add((p.y + at.y) * doc.w + (p.x + at.x));
  for (const l of frag.lights)
    standing.add((l.y + at.y) * doc.w + (l.x + at.x));
  next.props = next.props.filter(p => !standing.has(p.y * doc.w + p.x));
  next.lights = next.lights.filter(l => !standing.has(l.y * doc.w + l.x));
  for (const p of frag.props) {
    const x = p.x + at.x;
    const y = p.y + at.y;
    if (inBounds(doc, x, y)) next.props.push({ ...p, x, y });
  }
  for (const l of frag.lights) {
    const x = l.x + at.x;
    const y = l.y + at.y;
    if (inBounds(doc, x, y)) next.lights.push({ ...l, x, y });
  }
  if (frag.rooms.length > 0) {
    next.rooms = [
      ...(next.rooms ?? []).filter(r => !covered.has(r.y * doc.w + r.x)),
      ...frag.rooms
        .map(r => ({ ...r, x: r.x + at.x, y: r.y + at.y }))
        .filter(r => inBounds(doc, r.x, r.y)),
    ];
  }
  return next;
}

const TURN: Record<Side, Side> = { n: 'e', e: 's', s: 'w', w: 'n' };
const MIRROR: Record<Side, Side> = { n: 'n', s: 's', e: 'w', w: 'e' };

/** A quarter turn clockwise. (x, y) → (h − 1 − y, x). */
export function rotateFragment(frag: Fragment): Fragment {
  const w = frag.h;
  const h = frag.w;
  const material: (number | null)[] = new Array(w * h).fill(null);
  const elevation: (number | null)[] = new Array(w * h).fill(null);
  const map = (x: number, y: number): Tile => ({ x: frag.h - 1 - y, y: x });
  for (let y = 0; y < frag.h; y++) {
    for (let x = 0; x < frag.w; x++) {
      const t = map(x, y);
      material[t.y * w + t.x] = frag.material[y * frag.w + x];
      elevation[t.y * w + t.x] = frag.elevation[y * frag.w + x];
    }
  }
  return {
    w,
    h,
    material,
    elevation,
    walls: frag.walls.map(wl => ({
      ...wl,
      ...map(wl.x, wl.y),
      side: TURN[wl.side],
    })),
    props: frag.props.map(p => ({ ...p, ...map(p.x, p.y) })),
    lights: frag.lights.map(l => ({ ...l, ...map(l.x, l.y) })),
    rooms: frag.rooms.map(r => {
      // The room's box turns with it: its new top-left is the old
      // bottom-left's image.
      const t = map(r.x, r.y + r.h - 1);
      return { ...r, x: t.x, y: t.y, w: r.h, h: r.w };
    }),
    ...(frag.link
      ? {
          link: {
            ...frag.link,
            ...map(frag.link.x, frag.link.y + frag.link.h - 1),
            w: frag.link.h,
            h: frag.link.w,
          },
        }
      : {}),
  };
}

/** Mirrored left to right. */
export function flipFragment(frag: Fragment): Fragment {
  const { w, h } = frag;
  const material: (number | null)[] = new Array(w * h).fill(null);
  const elevation: (number | null)[] = new Array(w * h).fill(null);
  const mx = (x: number) => w - 1 - x;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      material[y * w + mx(x)] = frag.material[y * w + x];
      elevation[y * w + mx(x)] = frag.elevation[y * w + x];
    }
  }
  return {
    ...frag,
    material,
    elevation,
    walls: frag.walls.map(wl => ({
      ...wl,
      x: mx(wl.x),
      side: MIRROR[wl.side],
    })),
    props: frag.props.map(p => ({ ...p, x: mx(p.x) })),
    lights: frag.lights.map(l => ({ ...l, x: mx(l.x) })),
    rooms: frag.rooms.map(r => ({ ...r, x: mx(r.x + r.w - 1) })),
    ...(frag.link
      ? { link: { ...frag.link, x: mx(frag.link.x + frag.link.w - 1) } }
      : {}),
  };
}

/* --- rooms' names ------------------------------------------------------------ */

/** Name a box of floor, replacing any room whose top-left it shares. */
export function nameRoom(doc: TerrainDoc, room: Room): TerrainDoc {
  const next = open(doc);
  next.rooms = [
    ...(next.rooms ?? []).filter(r => !(r.x === room.x && r.y === room.y)),
    { ...room, name: room.name.trim().slice(0, 40) },
  ].filter(r => r.name);
  return next;
}

/** The room whose box holds a tile, if any. */
export function roomAt(doc: TerrainDoc, t: Tile): Room | null {
  return (
    (doc.rooms ?? []).find(
      r => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h
    ) ?? null
  );
}
