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
  materialAt,
  TILE_FEET,
  VOID,
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
    case 'rail':
      // A rail is something to vault, not something to stop at.
      return false;
  }
}

/** Whether a wall stops a line of sight, before its height is considered. */
export function blocksSight(wall: Wall | undefined): boolean {
  if (!wall) return false;
  switch (wall.kind) {
    case 'solid':
      return true;
    case 'window':
      return false;
    case 'door':
      return !wall.open;
    case 'rail':
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
 * `size` is 1, 2 or 3 for 1×1, 3×3, 5×5 — the reveal brush's scale, now
 * shared with the floor and the height tools so a room is not painted a
 * tile at a time.
 */
export function brushTiles(
  doc: TerrainDoc,
  at: Tile,
  size: 1 | 2 | 3
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
