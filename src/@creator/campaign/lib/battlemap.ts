/**
 * The rules of the board.
 *
 * Pure: no React, no `three`, no `server-only`, no database. This is where
 * distance, movement cost, occupancy, line of sight and fog live, and it is
 * pure for the same reason `dying.ts` is — it is the only way any of it gets
 * tested, because you cannot headlessly test a canvas. `the-last-breath`
 * verified 25 death-save rules against `dying.ts` apart from the app; this
 * module is meant to be verified the same way.
 *
 * Every rule is 2024. Where 2024 differs from 2014 it is said so in a comment,
 * because somebody will report it as a bug and it is not.
 */
import {
  across,
  edgeKey,
  inBounds,
  levelGapFeet,
  levelOf,
  linkTiles,
  materialAt,
  shortId,
  TILE_FEET,
  VOID,
  type Ambient,
  type BoardDoc,
  type LevelDoc,
  type LevelLink,
  type Side,
  type TerrainDoc,
  type Wall,
} from '@/@shared/battlemap/types';

export interface Tile {
  x: number;
  y: number;
}

/** A thing occupying tiles: a token's footprint anchored at its top-left. */
export interface Occupant {
  x: number;
  y: number;
  /** 1 = medium, 2 = large, 3 = huge. Tiles occupied, per side. */
  footprint: number;
}

/* --- distance ---------------------------------------------------------- */

/** How a diagonal step is priced. The table rule in `table-rules.ts`. */
export type DiagonalRule = '5-5-5' | '5-10-5';

/**
 * Distance in feet between two tiles.
 *
 * **2024: diagonals cost 5 feet, the same as orthogonal.** That makes
 * distance Chebyshev — `max(|dx|, |dy|)` — rather than the zig-zag people
 * remember. The 2014 DMG's optional 5-10-5, where every second diagonal costs
 * 10, is the one alternative, and a table that turns it on gets it here
 * rather than from a second function: `min(dx, dy)` diagonals, every other
 * one doubled, plus the straight remainder.
 */
export function distanceFeet(
  a: Tile,
  b: Tile,
  rule: DiagonalRule = '5-5-5'
): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (rule === '5-10-5') {
    const diagonals = Math.min(dx, dy);
    const straight = Math.max(dx, dy) - diagonals;
    return (diagonals + Math.floor(diagonals / 2) + straight) * TILE_FEET;
  }
  return Math.max(dx, dy) * TILE_FEET;
}

/** Tiles between two, in squares: the count a ruler shows beside the feet. */
export function distanceSquares(a: Tile, b: Tile): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/* --- walls ------------------------------------------------------------- */

/** Every wall, keyed by the one name its edge has. Built once per query. */
export function wallIndex(doc: TerrainDoc): Map<string, Wall> {
  const map = new Map<string, Wall>();
  for (const w of doc.walls) map.set(edgeKey(w.x, w.y, w.side), w);
  return map;
}

/** Whether a wall stops a creature walking through it. */
export function blocksMovement(wall: Wall | undefined): boolean {
  if (!wall) return false;
  switch (wall.kind) {
    case 'solid':
      return true;
    case 'window':
      // Blocks movement and not sight — the whole reason it is its own kind.
      return true;
    case 'door':
      return !wall.open;
    case 'hedge':
      // Six feet of thorn: a wall that happens to be green.
      return true;
    case 'rail':
    case 'fence':
      // A rail is something to vault, not something to stop at.
      return false;
  }
}

/** Whether a wall stops a line of sight, before its height is considered. */
export function blocksSight(wall: Wall | undefined): boolean {
  if (!wall) return false;
  switch (wall.kind) {
    case 'solid':
    case 'hedge':
      return true;
    case 'window':
      return false;
    case 'door':
      return !wall.open;
    case 'rail':
    case 'fence':
      return false;
  }
}

/** The edge between two orthogonally adjacent tiles, from `from`'s side. */
function sideToward(from: Tile, to: Tile): Side | null {
  if (to.x === from.x && to.y === from.y - 1) return 'n';
  if (to.x === from.x && to.y === from.y + 1) return 's';
  if (to.x === from.x - 1 && to.y === from.y) return 'w';
  if (to.x === from.x + 1 && to.y === from.y) return 'e';
  return null;
}

/* --- movement ---------------------------------------------------------- */

export interface StepCost {
  /** Feet of movement the step spends, or null if it cannot be taken. */
  feet: number | null;
  /** Why not, when it cannot. */
  reason?: 'void' | 'impassable' | 'wall' | 'climb' | 'bounds';
}

/**
 * How much moving one tile costs, and whether it can be done at all.
 *
 * Rules, all 2024:
 * - **A step is 5 feet**, orthogonal or diagonal (see `distanceFeet`).
 * - **Difficult terrain doubles** the cost of *entering* a tile — it is the
 *   destination's material that matters, not the origin's.
 * - **Climbing costs 1 extra foot per foot climbed.** A step up 5 feet costs
 *   10. Going down costs nothing extra.
 * - **A rise of more than 5 feet in one step is not a step.** That is a climb
 *   with a check behind it, and this function refuses rather than pricing it.
 * - Void and impassable materials cannot be entered.
 * - A wall on the shared edge that blocks movement stops the step. Diagonal
 *   steps are stopped if either of the two orthogonal edges they cut across
 *   is walled — you cannot slip between two walls that meet at a corner.
 */
export function stepCost(
  doc: TerrainDoc,
  from: Tile,
  to: Tile,
  walls: Map<string, Wall> = wallIndex(doc)
): StepCost {
  if (!inBounds(doc, to.x, to.y)) return { feet: null, reason: 'bounds' };
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
    return { feet: null, reason: 'bounds' };
  }

  const dest = materialAt(doc, to.x, to.y);
  if (doc.material[to.y * doc.w + to.x] === VOID) {
    return { feet: null, reason: 'void' };
  }
  if (dest.impassable) return { feet: null, reason: 'impassable' };

  // Walls. Orthogonal: the one shared edge. Diagonal: both edges the step
  // cuts across, from the origin's point of view.
  if (dx === 0 || dy === 0) {
    const side = sideToward(from, to);
    if (side && blocksMovement(walls.get(edgeKey(from.x, from.y, side)))) {
      return { feet: null, reason: 'wall' };
    }
  } else {
    const horiz: Side = to.x > from.x ? 'e' : 'w';
    const vert: Side = to.y > from.y ? 's' : 'n';
    if (
      blocksMovement(walls.get(edgeKey(from.x, from.y, horiz))) ||
      blocksMovement(walls.get(edgeKey(from.x, from.y, vert)))
    ) {
      return { feet: null, reason: 'wall' };
    }
  }

  const rise =
    (doc.elevation[to.y * doc.w + to.x] ?? 0) -
    (doc.elevation[from.y * doc.w + from.x] ?? 0);
  if (rise > TILE_FEET) return { feet: null, reason: 'climb' };

  let feet = TILE_FEET;
  if (dest.difficult) feet *= 2;
  if (rise > 0) feet += rise;
  return { feet };
}

/**
 * Every tile reachable within a movement budget, with the cheapest cost to
 * each. Dijkstra over the eight neighbours; the board is small enough that
 * nothing cleverer is worth its bugs.
 *
 * Two kinds of occupied tile, because 2024 treats them differently:
 * - `blocked` — a hostile creature's space. You may neither end there nor
 *   move through it.
 * - `passable` — an ally's space. You may move **through** it and may not
 *   **end** on it. (2024 PHB, "Moving Around Other Creatures".) Passing
 *   through costs the tile's normal price; the rules do not double it.
 */
export function reachable(
  doc: TerrainDoc,
  from: Tile,
  budgetFeet: number,
  blocked: ReadonlySet<number> = new Set(),
  passable: ReadonlySet<number> = new Set()
): Map<number, number> {
  const walls = wallIndex(doc);
  const start = from.y * doc.w + from.x;
  const best = new Map<number, number>([[start, 0]]);
  const open: [number, Tile][] = [[0, from]];

  while (open.length > 0) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, tile] = open.shift()!;
    const idx = tile.y * doc.w + tile.x;
    if (cost > (best.get(idx) ?? Infinity)) continue;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const next = { x: tile.x + dx, y: tile.y + dy };
        if (!inBounds(doc, next.x, next.y)) continue;
        const nidx = next.y * doc.w + next.x;
        if (blocked.has(nidx)) continue;
        const step = stepCost(doc, tile, next, walls);
        if (step.feet === null) continue;
        const total = cost + step.feet;
        if (total > budgetFeet) continue;
        if (total >= (best.get(nidx) ?? Infinity)) continue;
        best.set(nidx, total);
        open.push([total, next]);
      }
    }
  }

  best.delete(start);
  // An ally's square was a way through, never a place to stop.
  for (const i of passable) best.delete(i);
  return best;
}

/* --- occupancy --------------------------------------------------------- */

/** The tile indices a footprint covers, anchored at its top-left. */
export function footprintTiles(doc: TerrainDoc, o: Occupant): number[] {
  const out: number[] = [];
  const size = Math.max(1, Math.min(3, Math.trunc(o.footprint) || 1));
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = o.x + dx;
      const y = o.y + dy;
      if (!inBounds(doc, x, y)) return [];
      out.push(y * doc.w + x);
    }
  }
  return out;
}

/* --- painting ---------------------------------------------------------- */

/** Every in-bounds tile index in the box two corners span, either order. */
export function rectTiles(doc: TerrainDoc, a: Tile, b: Tile): number[] {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const x1 = Math.min(doc.w - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const y1 = Math.min(doc.h - 1, Math.max(a.y, b.y));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) out.push(y * doc.w + x);
  }
  return out;
}

/**
 * The tiles under a square brush centred on one, in bounds.
 *
 * `size` is 1 to 5 for 1×1, 3×3, 5×5, 7×7, 9×9 — the reveal brush's
 * scale, shared with the floor, the height and the scatter tools so a
 * room is not painted a tile at a time.
 */
export type BrushSize = 1 | 2 | 3 | 4 | 5;

export function brushTiles(
  doc: TerrainDoc,
  at: Tile,
  size: BrushSize
): number[] {
  const r = size - 1;
  const out: number[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = at.x + dx;
      const y = at.y + dy;
      if (inBounds(doc, x, y)) out.push(y * doc.w + x);
    }
  }
  return out;
}

/**
 * Every tile on the straight line from `a` to `b`, both ends included, in
 * order (Bresenham; `tilesBetween` below is the sight line's, which leaves
 * the ends out and samples instead). A brush stroke is applied along this rather than only
 * at each pointer event: a quick swipe skips tiles between two events, and
 * painted a dotted line where the reader drew a solid one.
 */
export function tilesAlong(a: Tile, b: Tile): Tile[] {
  const out: Tile[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const sx = x < b.x ? 1 : -1;
  const dy = -Math.abs(b.y - y);
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Flood fill: every tile connected to `at` by the same material, as a list
 * of indices to repaint.
 *
 * Four-connected, and bounded by anything that stops a creature walking —
 * a wall, a closed door, a window — so a room fills to its walls and not
 * through them. A rail is vaulted, so it is not a boundary; an open door is
 * walked through, so a fill runs into the next room the way the party
 * would. The material to compare against is the one under `at`; the
 * caller decides what to paint over it and skips the call when it is the
 * same.
 */
export function floodFill(doc: TerrainDoc, at: Tile): number[] {
  if (!inBounds(doc, at.x, at.y)) return [];
  const walls = wallIndex(doc);
  const from = doc.material[at.y * doc.w + at.x] ?? VOID;
  const seen = new Set<number>();
  const out: number[] = [];
  const queue: Tile[] = [{ x: at.x, y: at.y }];
  seen.add(at.y * doc.w + at.x);
  while (queue.length) {
    const t = queue.shift()!;
    out.push(t.y * doc.w + t.x);
    for (const side of ['n', 'e', 's', 'w'] as const) {
      const [nx, ny] = across(t.x, t.y, side);
      if (!inBounds(doc, nx, ny)) continue;
      const ni = ny * doc.w + nx;
      if (seen.has(ni)) continue;
      if ((doc.material[ni] ?? VOID) !== from) continue;
      if (blocksMovement(walls.get(edgeKey(t.x, t.y, side)))) continue;
      seen.add(ni);
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}

/* --- jumping ------------------------------------------------------------ */

/**
 * Where a token could land by jumping (09): the far side of a gap — void,
 * lava, anything that cannot be stood on — in each of the four directions,
 * within the jumper's long jump. A 10 ft run-up behind the token (two
 * standable tiles in the direction it came from) gets the full distance;
 * without one, the standing half. 2024 PHB: a long jump covers your
 * Strength score in feet with the run-up, half that from a standstill, and
 * each foot costs a foot of movement — the board lights what the rules
 * allow; spending the movement is the table's.
 *
 * Returns the landing tiles, so the board can ring them and a tap on one is
 * the ordinary move.
 */
export function jumpLandings(
  doc: TerrainDoc,
  jumper: Occupant,
  others: readonly Occupant[],
  longFeet: number,
  standingFeet: number
): number[] {
  const out: number[] = [];
  const gap = (x: number, y: number): boolean =>
    inBounds(doc, x, y) &&
    (doc.material[y * doc.w + x] === VOID || materialAt(doc, x, y).impassable);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    // The run-up: the two tiles behind, standable and not a gap.
    const back1 = {
      x: jumper.x - dx,
      y: jumper.y - dy,
      footprint: jumper.footprint,
    };
    const back2 = {
      x: jumper.x - 2 * dx,
      y: jumper.y - 2 * dy,
      footprint: jumper.footprint,
    };
    const runUp = canStand(doc, back1, others) && canStand(doc, back2, others);
    const feet = runUp ? longFeet : standingFeet;
    const tiles = Math.floor(feet / TILE_FEET);
    // Walk into the gap from the tile in front; the first standable tile
    // past the gap is the landing, if it is within reach.
    let x = jumper.x + dx;
    let y = jumper.y + dy;
    let crossed = 0;
    while (gap(x, y)) {
      crossed += 1;
      x += dx;
      y += dy;
    }
    if (crossed === 0) continue;
    if (crossed + 1 > tiles) continue;
    const landing = { x, y, footprint: jumper.footprint };
    if (!inBounds(doc, x, y)) continue;
    if (canStand(doc, landing, others)) out.push(y * doc.w + x);
  }
  return out;
}

/**
 * Why a footprint cannot stand at a position, or null when it can.
 *
 * Two kinds of no. `bounds`, `void` and `occupied` are the model: off the
 * board, on no board, or on top of somebody — nothing a DM says makes two
 * things fit in one tile. `terrain` is the rules: lava, or a pillar. That
 * is what the table's Advise / Enforce switch governs (`table-rules.ts`),
 * so it is told apart here rather than folded into one boolean. A large
 * creature does not get to put one corner in a wall either way.
 */
export type StandingIssue = 'bounds' | 'void' | 'occupied' | 'terrain';

export function standingIssue(
  doc: TerrainDoc,
  o: Occupant,
  others: readonly Occupant[]
): StandingIssue | null {
  const tiles = footprintTiles(doc, o);
  if (tiles.length === 0) return 'bounds';

  const taken = new Set<number>();
  for (const other of others) {
    for (const t of footprintTiles(doc, other)) taken.add(t);
  }
  const blocked = new Set<number>();
  for (const p of doc.props) {
    if (p.blocks) blocked.add(p.y * doc.w + p.x);
  }

  let terrain = false;
  for (const t of tiles) {
    if (taken.has(t)) return 'occupied';
    const m = doc.material[t] ?? VOID;
    if (m === VOID) return 'void';
    const mat = materialAt(doc, t % doc.w, Math.floor(t / doc.w));
    if (mat.impassable || blocked.has(t)) terrain = true;
  }
  return terrain ? 'terrain' : null;
}

/**
 * Whether a footprint can stand at a position, by the book.
 *
 * Every tile it covers must be in bounds, not void, not impassable, and not
 * under a blocking prop or another occupant. `standingIssue` says which.
 */
export function canStand(
  doc: TerrainDoc,
  o: Occupant,
  others: readonly Occupant[]
): boolean {
  return standingIssue(doc, o, others) === null;
}

/**
 * Whether the server would let a footprint be put there, under the table's
 * mode. The model's refusals always hold; the rules' hold only when the
 * table enforces. A board uses `canStand` to colour the tile and this to
 * decide whether to send the move — so advising, lava reads red and is
 * still walked into, which is what advising means.
 */
export function canStandUnder(
  doc: TerrainDoc,
  o: Occupant,
  others: readonly Occupant[],
  mode: 'advise' | 'enforce'
): boolean {
  const issue = standingIssue(doc, o, others);
  return issue === null || (issue === 'terrain' && mode === 'advise');
}

/* --- line of sight ----------------------------------------------------- */

/** Height of the eye above the datum, standing on a tile. */
const EYE_FEET = 5;

/**
 * Whether the segment `p→q` crosses the segment `r→s`. Standard orientation
 * test; touching at an endpoint counts as crossing, which is the safer error
 * for a wall.
 */
function segmentsCross(
  p: [number, number],
  q: [number, number],
  r: [number, number],
  s: [number, number]
): boolean {
  const orient = (
    a: [number, number],
    b: [number, number],
    c: [number, number]
  ) => {
    const v = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
    if (Math.abs(v) < 1e-9) return 0;
    return v > 0 ? 1 : 2;
  };
  const onSeg = (
    a: [number, number],
    b: [number, number],
    c: [number, number]
  ) =>
    b[0] <= Math.max(a[0], c[0]) + 1e-9 &&
    b[0] >= Math.min(a[0], c[0]) - 1e-9 &&
    b[1] <= Math.max(a[1], c[1]) + 1e-9 &&
    b[1] >= Math.min(a[1], c[1]) - 1e-9;

  const o1 = orient(p, q, r);
  const o2 = orient(p, q, s);
  const o3 = orient(r, s, p);
  const o4 = orient(r, s, q);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p, r, q)) return true;
  if (o2 === 0 && onSeg(p, s, q)) return true;
  if (o3 === 0 && onSeg(r, p, s)) return true;
  if (o4 === 0 && onSeg(r, q, s)) return true;
  return false;
}

/** The two endpoints of a wall's edge, in tile-centre coordinates. */
function wallSegment(w: Wall): [[number, number], [number, number]] {
  // Tile (x, y) has its centre at (x, y); its edges are at ±0.5.
  switch (w.side) {
    case 'n':
      return [
        [w.x - 0.5, w.y - 0.5],
        [w.x + 0.5, w.y - 0.5],
      ];
    case 's':
      return [
        [w.x - 0.5, w.y + 0.5],
        [w.x + 0.5, w.y + 0.5],
      ];
    case 'w':
      return [
        [w.x - 0.5, w.y - 0.5],
        [w.x - 0.5, w.y + 0.5],
      ];
    case 'e':
      return [
        [w.x + 0.5, w.y - 0.5],
        [w.x + 0.5, w.y + 0.5],
      ];
  }
}

/**
 * Whether `from` can see `to`.
 *
 * A segment from tile centre to tile centre, eye height above each tile's
 * elevation, tested against every wall whose kind blocks sight. A wall only
 * blocks if the sight line is **below its top at the crossing** — an archer on
 * a 15-foot gantry sees over a 10-foot wall, and a wall on the far side of a
 * pit is passed over rather than through.
 *
 * The wall's base is the higher of the two tiles it sits between, because a
 * wall on a ledge stands on the ledge.
 */
export function canSee(doc: TerrainDoc, from: Tile, to: Tile): boolean {
  if (from.x === to.x && from.y === to.y) return true;
  const p: [number, number] = [from.x, from.y];
  const q: [number, number] = [to.x, to.y];
  const eyeFrom = (doc.elevation[from.y * doc.w + from.x] ?? 0) + EYE_FEET;
  const eyeTo = (doc.elevation[to.y * doc.w + to.x] ?? 0) + EYE_FEET;
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]);

  for (const w of doc.walls) {
    if (!blocksSight(w)) continue;
    const [r, s] = wallSegment(w);
    if (!segmentsCross(p, q, r, s)) continue;

    // Where along the sight line the crossing is, 0..1, by projecting the
    // wall's midpoint — good enough for an axis-aligned edge.
    const mid: [number, number] = [(r[0] + s[0]) / 2, (r[1] + s[1]) / 2];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((mid[0] - p[0]) * (q[0] - p[0]) + (mid[1] - p[1]) * (q[1] - p[1])) /
          (length * length)
      )
    );
    const sightHeight = eyeFrom + (eyeTo - eyeFrom) * t;

    const [ax, ay] = across(w.x, w.y, w.side);
    const here = doc.elevation[w.y * doc.w + w.x] ?? 0;
    const there = inBounds(doc, ax, ay)
      ? (doc.elevation[ay * doc.w + ax] ?? 0)
      : here;
    const top = Math.max(here, there) + w.height;

    if (sightHeight < top) return false;
  }
  return true;
}

/* --- cover and flanking -------------------------------------------------- */

export type Cover = 'none' | 'half' | 'three-quarters' | 'total';

const COVER_RANK: Record<Cover, number> = {
  none: 0,
  half: 1,
  'three-quarters': 2,
  total: 3,
};

function worse(a: Cover, b: Cover): Cover {
  return COVER_RANK[b] > COVER_RANK[a] ? b : a;
}

/**
 * The tiles a sight line passes through, endpoints excluded — sampled along
 * the segment finely enough that no tile it crosses is skipped.
 */
function tilesBetween(from: Tile, to: Tile): Tile[] {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 4;
  const seen = new Set<string>();
  const out: Tile[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    if ((x === from.x && y === from.y) || (x === to.x && y === to.y)) continue;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y });
  }
  return out;
}

/** Something standing between: a creature's tiles, for half cover. */
export interface CoverOccupant {
  x: number;
  y: number;
  footprint: number;
}

/**
 * How much the target is covered from the attacker (2024 PHB, "Cover").
 *
 * Walls the sight line cannot see over give total cover — `canSee` already
 * knows about height and elevation. A window crossed gives three-quarters, a
 * rail half. A prop on a tile between: a pillar or a tree three-quarters, a
 * table, barrel, chest, altar or statue half; rubble nothing. Another
 * creature on a tile between gives half. The worst of them stands.
 *
 * Total cover is a refusal in `attack` — overridable, because a DM knows the
 * target is leaning round the corner.
 */
export function coverBetween(
  doc: TerrainDoc,
  from: Tile,
  to: Tile,
  occupants: readonly CoverOccupant[] = []
): Cover {
  if (from.x === to.x && from.y === to.y) return 'none';
  if (!canSee(doc, from, to)) return 'total';

  let cover: Cover = 'none';
  const p: [number, number] = [from.x, from.y];
  const q: [number, number] = [to.x, to.y];
  for (const w of doc.walls) {
    if (w.kind !== 'window' && w.kind !== 'rail' && w.kind !== 'fence') {
      continue;
    }
    const [r, s] = wallSegment(w);
    if (!segmentsCross(p, q, r, s)) continue;
    cover = worse(cover, w.kind === 'window' ? 'three-quarters' : 'half');
  }

  const between = tilesBetween(from, to);
  if (between.length === 0) return cover;
  const betweenKeys = new Set(between.map(t => `${t.x},${t.y}`));

  for (const prop of doc.props) {
    if (!betweenKeys.has(`${prop.x},${prop.y}`)) continue;
    switch (prop.kind) {
      case 'pillar':
      case 'tree':
      case 'pine':
      case 'boulder':
        cover = worse(cover, 'three-quarters');
        break;
      case 'table':
      case 'barrel':
      case 'chest':
      case 'altar':
      case 'statue':
      case 'bush':
      case 'bed':
      case 'shelf':
      case 'hearth':
        cover = worse(cover, 'half');
        break;
      case 'image':
        // A standee is as tall as the DM said; head-high or more hides most.
        cover = worse(
          cover,
          (prop.height ?? 0) >= 10 ? 'three-quarters' : 'half'
        );
        break;
      default:
        break;
    }
  }

  for (const o of occupants) {
    const size = Math.max(1, Math.min(3, Math.trunc(o.footprint) || 1));
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (betweenKeys.has(`${o.x + dx},${o.y + dy}`)) {
          cover = worse(cover, 'half');
        }
      }
    }
  }
  return cover;
}

/**
 * Whether an ally of the attacker stands on the far side of the target — the
 * optional flanking rule (01). For a one-tile target that is the tile
 * mirrored through it; for a bigger one, any tile of the footprint's far
 * side. An ally is any tile of any ally's footprint.
 */
export function flanked(
  attacker: Tile,
  target: CoverOccupant,
  allies: readonly CoverOccupant[]
): boolean {
  const size = Math.max(1, Math.min(3, Math.trunc(target.footprint) || 1));
  // Which side of the footprint the attacker stands on: a hero beside a
  // Large ogre is west of it, not "south-west of its centre".
  const dx =
    attacker.x < target.x ? 1 : attacker.x > target.x + size - 1 ? -1 : 0;
  const dy =
    attacker.y < target.y ? 1 : attacker.y > target.y + size - 1 ? -1 : 0;
  if (dx === 0 && dy === 0) return false;
  // The tiles just past the footprint, opposite the attacker.
  const far: Tile[] = [];
  const beyondX = dx > 0 ? target.x + size : dx < 0 ? target.x - 1 : null;
  const beyondY = dy > 0 ? target.y + size : dy < 0 ? target.y - 1 : null;
  for (let i = 0; i < size; i++) {
    if (beyondX !== null) far.push({ x: beyondX, y: beyondY ?? target.y + i });
    if (beyondY !== null) far.push({ x: beyondX ?? target.x + i, y: beyondY });
  }
  const keys = new Set(far.map(t => `${t.x},${t.y}`));
  return allies.some(a => {
    const s = Math.max(1, Math.min(3, Math.trunc(a.footprint) || 1));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (keys.has(`${a.x + x},${a.y + y}`)) return true;
      }
    }
    return false;
  });
}

/* --- areas ---------------------------------------------------------------- */

export type AreaShape =
  | 'sphere'
  | 'cube'
  | 'cone'
  | 'line'
  | 'cylinder'
  | 'emanation';

export interface Area {
  shape: AreaShape;
  /** The floor it is on. Absent on a one-floor board: the ground floor. */
  level?: string;
  /** The tile the effect springs from — the point of origin, or the caster. */
  origin: Tile;
  /** Cone and line: the tile the shape points at. Cube: the corner it grows toward. */
  direction?: Tile;
  /** Radius, side or length, in feet. */
  size: number;
  /** Line only; 0 reads as 5. */
  width?: number;
}

/**
 * The tiles an area covers, by the DMG's "on a grid" method.
 *
 * A sphere, cylinder or emanation is every tile whose centre is within `size`
 * feet of the origin's — Chebyshev on a 5-5-5 board, so it draws as the
 * square people expect. A cube is `size / 5` tiles a side, grown from the
 * origin toward `direction` (or east and south). A cone is `size` long and as
 * wide at its end as it is long, along `direction`; a line is `size` long and
 * `width` wide. Tiles the origin cannot see — behind a wall — are left out,
 * so a Fireball around a corner lights only what the blast reaches; the DM
 * may add one back by tapping it.
 */
export function areaTiles(doc: TerrainDoc, area: Area): Set<number> {
  const out = new Set<number>();
  const add = (x: number, y: number) => {
    if (!inBounds(doc, x, y)) return;
    if (!canSee(doc, area.origin, { x, y })) return;
    out.add(y * doc.w + x);
  };
  const tiles = Math.max(1, Math.round(area.size / TILE_FEET));
  const o = area.origin;

  switch (area.shape) {
    case 'sphere':
    case 'cylinder':
    case 'emanation': {
      for (let y = o.y - tiles; y <= o.y + tiles; y++) {
        for (let x = o.x - tiles; x <= o.x + tiles; x++) add(x, y);
      }
      // An emanation spreads from the creature's own space and does not
      // include it; a sphere centred on a point does.
      if (area.shape === 'emanation') out.delete(o.y * doc.w + o.x);
      return out;
    }
    case 'cube': {
      const d = area.direction ?? { x: o.x + 1, y: o.y + 1 };
      const sx = d.x < o.x ? -1 : 1;
      const sy = d.y < o.y ? -1 : 1;
      for (let i = 0; i < tiles; i++) {
        for (let j = 0; j < tiles; j++) add(o.x + sx * i, o.y + sy * j);
      }
      return out;
    }
    case 'cone':
    case 'line': {
      const d = area.direction ?? { x: o.x + 1, y: o.y };
      const dx = d.x - o.x;
      const dy = d.y - o.y;
      const halfWidth =
        area.shape === 'line'
          ? Math.max(1, Math.round((area.width || TILE_FEET) / TILE_FEET)) / 2
          : 0;
      const axis = dx === 0 || dy === 0;
      const diagonal = Math.abs(dx) === Math.abs(dy) && dx !== 0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      /*
       * How far out and how far across a tile sits, in tiles. Along an axis
       * or a diagonal the board's own arithmetic: a diagonal step is one
       * tile on a 5-5-5 board, so a 15 ft cone reaches three tiles out
       * whichever way it points. Anything in between projects onto the ray.
       */
      const place = (px: number, py: number): [number, number] | null => {
        if (axis) {
          const along = dx !== 0 ? px * Math.sign(dx) : py * Math.sign(dy);
          const across = dx !== 0 ? Math.abs(py) : Math.abs(px);
          return along > 0 ? [along, across] : null;
        }
        if (diagonal) {
          const a = px * Math.sign(dx);
          const b = py * Math.sign(dy);
          if (a < 0 || b < 0 || (a === 0 && b === 0)) return null;
          return [Math.max(a, b), Math.abs(a - b)];
        }
        const along = px * ux + py * uy;
        const across = Math.abs(px * uy - py * ux);
        return along > 0 ? [along, across] : null;
      };
      for (let y = o.y - tiles; y <= o.y + tiles; y++) {
        for (let x = o.x - tiles; x <= o.x + tiles; x++) {
          if (x === o.x && y === o.y) continue;
          const at = place(x - o.x, y - o.y);
          if (!at) continue;
          const [along, across] = at;
          if (along > tiles + 0.01) continue;
          // As wide as it is long: half the distance out, either side.
          const allowed =
            area.shape === 'cone' ? along / 2 + 0.01 : halfWidth + 0.01;
          if (across <= allowed) add(x, y);
        }
      }
      return out;
    }
  }
}

/* --- fog --------------------------------------------------------------- */

/**
 * Every tile a viewer on `from` can see, within a radius in feet.
 *
 * Used for "reveal what the party can see": a union of this over each party
 * token is what the DM presses one button for. Radius keeps it honest — a
 * torch is 40 feet, and a hall a hundred feet long stays dark at the far end.
 */
export function visibleFrom(
  doc: TerrainDoc,
  from: Tile,
  radiusFeet: number
): Set<number> {
  const out = new Set<number>();
  const r = Math.ceil(radiusFeet / TILE_FEET);
  for (let y = from.y - r; y <= from.y + r; y++) {
    for (let x = from.x - r; x <= from.x + r; x++) {
      if (!inBounds(doc, x, y)) continue;
      const to = { x, y };
      if (distanceFeet(from, to) > radiusFeet) continue;
      if (canSee(doc, from, to)) out.add(y * doc.w + x);
    }
  }
  return out;
}

/**
 * The document a player is allowed to have.
 *
 * **A new document, never the stored one mutated.** Every unrevealed tile
 * becomes void at elevation 0; walls survive only where at least one of the
 * two tiles they sit between is revealed; props and lights only on revealed
 * tiles. This is the fog of war — the server-side filter — and it is the
 * whole of decision 6: if the renderer hides the unrevealed parts, a player
 * opens devtools and reads the dungeon.
 */
export function fogged(
  doc: TerrainDoc,
  revealed: ReadonlySet<number>
): TerrainDoc {
  const n = doc.w * doc.h;
  const elevation = new Array(n).fill(0);
  const material = new Array(n).fill(VOID);
  for (const i of revealed) {
    if (i < 0 || i >= n) continue;
    elevation[i] = doc.elevation[i] ?? 0;
    material[i] = doc.material[i] ?? VOID;
  }

  const shown = (x: number, y: number) =>
    inBounds(doc, x, y) && revealed.has(y * doc.w + x);

  return {
    format: doc.format,
    version: doc.version,
    ambient: doc.ambient,
    w: doc.w,
    h: doc.h,
    elevation,
    material,
    walls: doc.walls.filter(w => {
      const [ax, ay] = across(w.x, w.y, w.side);
      return shown(w.x, w.y) || shown(ax, ay);
    }),
    props: doc.props.filter(p => shown(p.x, p.y)),
    lights: doc.lights.filter(l => shown(l.x, l.y)),
    // A room's name once any of it is seen: "the great hall" is what the
    // party calls it after one look through the door.
    ...(doc.rooms
      ? {
          rooms: doc.rooms.filter(r => {
            for (let y = r.y; y < r.y + r.h; y++) {
              for (let x = r.x; x < r.x + r.w; x++)
                if (shown(x, y)) return true;
            }
            return false;
          }),
        }
      : {}),
  };
}

/**
 * The board a player is allowed to have: each floor through `fogged` with
 * its own revealed set, and only the floors that have anything revealed
 * or a party member standing on them (`trodden`) — unless the floor says
 * otherwise (`seen`): `always` is whole from the start, `reveal` waits
 * for the DM whoever is standing on it. Hidden stairs are left out; the
 * rest are kept where a tile of them is revealed on a floor the player
 * has. A
 * board with nothing shown still carries the ground floor, fogged whole,
 * so there is always a floor to draw.
 */
export function foggedBoard(
  board: BoardDoc,
  revealed: ReadonlyMap<string, ReadonlySet<number>>,
  trodden: ReadonlySet<string> = new Set()
): BoardDoc {
  const n = board.w * board.h;
  const whole = new Set<number>();
  for (let i = 0; i < n; i++) whole.add(i);
  const shownOn = (l: LevelDoc): ReadonlySet<number> =>
    l.seen === 'always' ? whole : (revealed.get(l.id) ?? new Set());
  const kept = board.levels.filter(
    l =>
      l.seen === 'always' ||
      (revealed.get(l.id)?.size ?? 0) > 0 ||
      (l.seen !== 'reveal' && trodden.has(l.id))
  );
  const levels = (kept.length > 0 ? kept : [levelOf(board, null)]).map(l => ({
    ...fogged(l, shownOn(l)),
    id: l.id,
    name: l.name,
    feet: l.feet,
    ...(l.seen ? { seen: l.seen } : {}),
  }));
  const ids = new Set(levels.map(l => l.id));
  const byId = new Map(board.levels.map(l => [l.id, l]));
  return {
    format: board.format,
    version: board.version,
    w: board.w,
    h: board.h,
    levels,
    // A stair the party has seen a tile of, on a floor they have: a
    // stairwell in a dark corner is not on their board until the corner is.
    links: board.links.filter(
      k =>
        !k.hidden &&
        [k.from, k.to].some(id => {
          const l = byId.get(id);
          return (
            l && ids.has(id) && linkTiles(board, k).some(i => shownOn(l).has(i))
          );
        })
    ),
  };
}

/* --- what the boards share ---------------------------------------------- */

/** The least a board needs to know about a token to price its movement. */
export interface ReachToken {
  id: string;
  x: number;
  y: number;
  footprint: number;
  /** `party` | `foe` | `other`, off the entry; null for scenery. */
  side: string | null;
}

/**
 * Reach for one token among others, the way both the 2D board and the 3D
 * table compute it — here, so the two cannot drift. Same side is passable;
 * anything else is blocked. Scenery (`side: null`) blocks everybody, because
 * you cannot walk through a barrel.
 */
export function reachFor(
  doc: TerrainDoc,
  me: ReachToken,
  others: readonly ReachToken[],
  speedFeet: number
): Map<number, number> {
  const blocked = new Set<number>();
  const passable = new Set<number>();
  for (const t of others) {
    if (t.id === me.id) continue;
    const ally = me.side !== null && t.side !== null && t.side === me.side;
    for (let dy = 0; dy < t.footprint; dy++) {
      for (let dx = 0; dx < t.footprint; dx++) {
        (ally ? passable : blocked).add((t.y + dy) * doc.w + (t.x + dx));
      }
    }
  }
  return reachable(doc, { x: me.x, y: me.y }, speedFeet, blocked, passable);
}

/* --- floors ---------------------------------------------------------------- */

/**
 * What taking a link costs, in feet of movement, from this floor to the
 * other. The token has already walked onto the stair; this is the climb.
 * Stairs are ordinary movement: the rise, in 5-foot steps. A ladder is a
 * climb — 2024 PHB, "Climbing": each foot costs one extra — so the rise is
 * paid twice. A DM ruling past a short turn is the fence's business, not
 * this function's.
 */
export function linkCostFeet(
  board: BoardDoc,
  link: LevelLink,
  fromLevelId: string
): number {
  const other = link.from === fromLevelId ? link.to : link.from;
  const rise = levelGapFeet(board, fromLevelId, other);
  const feet = link.kind === 'ladder' ? rise * 2 : rise;
  return Math.max(TILE_FEET, Math.ceil(feet / TILE_FEET) * TILE_FEET);
}

/** The links on this floor that an occupant's footprint is standing on. */
export function linksUnder(
  board: BoardDoc,
  levelId: string,
  o: Occupant
): LevelLink[] {
  const level = levelOf(board, levelId);
  const mine = new Set(footprintTiles(level, o));
  if (mine.size === 0) return [];
  return board.links.filter(
    l =>
      (l.from === levelId || l.to === levelId) &&
      linkTiles(board, l).some(i => mine.has(i))
  );
}

/**
 * Where a token lands on the far floor: the same tile if it can stand
 * there, else the first tile of the link's footprint that can, else null —
 * a stairwell with a bookcase pushed across the top of it.
 */
export function landingFor(
  doc: TerrainDoc,
  link: LevelLink,
  mover: Occupant,
  others: readonly Occupant[]
): Tile | null {
  const same = { x: mover.x, y: mover.y, footprint: mover.footprint };
  if (canStand(doc, same, others)) return { x: same.x, y: same.y };
  for (const i of linkTiles(doc, link)) {
    const t = { x: i % doc.w, y: Math.floor(i / doc.w) };
    if (canStand(doc, { ...t, footprint: mover.footprint }, others)) return t;
  }
  return null;
}

/**
 * A room in one drag: the floor painted inside the box, a solid wall on
 * every edge of its perimeter that has none, and — where the box abuts
 * floor that is already there — a door in the middle of the shared run,
 * because a room you cannot get into is a very safe room. Walls already on
 * the perimeter stay as they are, so two rooms drawn side by side share
 * one wall rather than two.
 */
export function roomEdits(
  doc: TerrainDoc,
  a: Tile,
  b: Tile,
  material: number,
  opts: { door: boolean; merge?: boolean } = { door: true }
): TerrainDoc {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const x1 = Math.min(doc.w - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const y1 = Math.min(doc.h - 1, Math.max(a.y, b.y));
  const inside = (x: number, y: number) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const wasFloor = (x: number, y: number) =>
    inBounds(doc, x, y) && (doc.material[y * doc.w + x] ?? VOID) !== VOID;
  const next: TerrainDoc = {
    ...doc,
    material: [...doc.material],
    walls: doc.walls.map(w => ({ ...w })),
  };
  for (const i of rectTiles(doc, a, b)) next.material[i] = material;
  const walls = wallIndex(next);
  // Each side of the perimeter is one run; a door goes in the middle of
  // the stretch that meets existing floor, one per side.
  const sides: { side: Side; edges: Tile[]; across: (t: Tile) => Tile }[] = [
    {
      side: 'n',
      edges: [],
      across: t => ({ x: t.x, y: t.y - 1 }),
    },
    {
      side: 's',
      edges: [],
      across: t => ({ x: t.x, y: t.y + 1 }),
    },
    {
      side: 'w',
      edges: [],
      across: t => ({ x: t.x - 1, y: t.y }),
    },
    {
      side: 'e',
      edges: [],
      across: t => ({ x: t.x + 1, y: t.y }),
    },
  ];
  for (let x = x0; x <= x1; x++) {
    sides[0].edges.push({ x, y: y0 });
    sides[1].edges.push({ x, y: y1 });
  }
  for (let y = y0; y <= y1; y++) {
    sides[2].edges.push({ x: x0, y });
    sides[3].edges.push({ x: x1, y });
  }
  for (const s of sides) {
    const meets = s.edges.filter(t => {
      const o = s.across(t);
      return !inside(o.x, o.y) && wasFloor(o.x, o.y);
    });
    const doorAt =
      opts.door && meets.length > 0
        ? meets[Math.floor(meets.length / 2)]
        : null;
    for (const t of s.edges) {
      const key = edgeKey(t.x, t.y, s.side);
      // Sharing walls with neighbours keeps what stands there; not sharing
      // builds this room's own wall over it.
      if (walls.has(key)) {
        if (opts.merge !== false) continue;
        next.walls = next.walls.filter(w => edgeKey(w.x, w.y, w.side) !== key);
      }
      const door = doorAt && doorAt.x === t.x && doorAt.y === t.y;
      const wall: Wall = door
        ? {
            x: t.x,
            y: t.y,
            side: s.side,
            kind: 'door',
            height: 10,
            open: false,
          }
        : { x: t.x, y: t.y, side: s.side, kind: 'solid', height: 10 };
      next.walls.push(wall);
      walls.set(key, wall);
    }
  }
  return next;
}

export type LevelStart = 'void' | 'outer' | 'copy';

/**
 * A new floor, from the one it sits above or below. `void` is open air to
 * paint in; `outer` copies the source's shell — its footprint as one
 * material, and only the walls that face the outside — empty inside;
 * `copy` copies rooms, walls and doors, and never furniture or lights.
 * Nothing on the new floor points at the old: it is a floor, not a mirror.
 */
export function newLevelFrom(
  board: BoardDoc,
  source: LevelDoc,
  opts: {
    name: string;
    feet: number;
    ambient: Ambient;
    start: LevelStart;
    material?: number;
  }
): LevelDoc {
  const n = board.w * board.h;
  const level: LevelDoc = {
    format: source.format,
    version: source.version,
    w: board.w,
    h: board.h,
    id: shortId(),
    name: opts.name.trim().slice(0, 60) || 'A floor',
    feet: opts.feet,
    ambient: opts.ambient,
    elevation: new Array(n).fill(0),
    material: new Array(n).fill(VOID),
    walls: [],
    props: [],
    lights: [],
  };
  if (opts.start === 'void') return level;
  const material = opts.material ?? 4;
  if (opts.start === 'copy') {
    level.material = [...source.material];
    level.elevation = [...source.elevation];
    level.walls = source.walls.map(w => ({ ...w }));
    return level;
  }
  for (let i = 0; i < n; i++) {
    if ((source.material[i] ?? VOID) !== VOID) level.material[i] = material;
  }
  level.walls = source.walls
    .filter(w => {
      const [ax, ay] = across(w.x, w.y, w.side);
      const here = (source.material[w.y * source.w + w.x] ?? VOID) !== VOID;
      const there =
        inBounds(source, ax, ay) &&
        (source.material[ay * source.w + ax] ?? VOID) !== VOID;
      return here !== there;
    })
    .map(w => ({ x: w.x, y: w.y, side: w.side, kind: 'solid', height: 10 }));
  return level;
}
