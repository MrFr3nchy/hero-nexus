/**
 * Things that do something (improvements 08): the arithmetic of a lever.
 *
 * A `ThingEffect` is a list of changes to a terrain document — floor, height,
 * a wall, a reveal — plus the ones that touch tokens and hit points, which
 * the server applies. This module applies the document changes to a copy and
 * hands back what would put them back, so a `toggle` lever's second pull is
 * a computed undo rather than a second authored effect; and it walks the
 * cheapest path a move takes, tile by tile, so a trap knows it was crossed.
 *
 * Pure — no React, no DB, no `server-only`.
 */
import {
  edgeKey,
  inBounds,
  MATERIALS,
  VOID,
  WALL_HEIGHT,
  type TerrainDoc,
  type ThingChange,
  type Wall,
  type WallKind,
} from '@/@shared/battlemap/types';
import { stepCost, wallIndex, type Tile } from './battlemap';

/** The document changes; the server handles the rest. */
export function isTerrainChange(
  c: ThingChange
): c is Extract<ThingChange, { kind: 'material' | 'elevation' | 'wall' }> {
  return c.kind === 'material' || c.kind === 'elevation' || c.kind === 'wall';
}

/** Parse the `x,y|x,y` form `edgeKey` writes back into a wall's place. */
export function parseEdge(
  edge: string
): { x: number; y: number; side: 'e' | 's' } | null {
  const m = /^(-?\d+),(-?\d+)\|(-?\d+),(-?\d+)$/.exec(edge);
  if (!m) return null;
  const [ax, ay, bx, by] = [m[1], m[2], m[3], m[4]].map(Number);
  if (bx === ax + 1 && by === ay) return { x: ax, y: ay, side: 'e' };
  if (by === ay + 1 && bx === ax) return { x: ax, y: ay, side: 's' };
  return null;
}

/**
 * Apply the document changes to a copy of the terrain. Returns the copy and
 * the changes that would undo it — the previous material of every tile, the
 * wall that stood on every edge — in the order that restores them.
 */
export function applyTerrainChanges(
  doc: TerrainDoc,
  changes: readonly ThingChange[]
): { doc: TerrainDoc; undo: ThingChange[] } {
  const next: TerrainDoc = {
    ...doc,
    material: [...doc.material],
    elevation: [...doc.elevation],
    walls: doc.walls.map(w => ({ ...w })),
  };
  const undo: ThingChange[] = [];
  const n = doc.w * doc.h;

  for (const c of changes) {
    if (c.kind === 'material') {
      const to = MATERIALS[c.to] ? c.to : VOID;
      // Grouped by what they were, so the undo is as short as the change.
      const byPrev = new Map<number, number[]>();
      for (const i of c.tiles) {
        if (i < 0 || i >= n) continue;
        const prev = next.material[i];
        if (!byPrev.has(prev)) byPrev.set(prev, []);
        byPrev.get(prev)!.push(i);
        next.material[i] = to;
      }
      for (const [prev, tiles] of byPrev) {
        undo.push({ kind: 'material', tiles, to: prev });
      }
    } else if (c.kind === 'elevation') {
      const byPrev = new Map<number, number[]>();
      for (const i of c.tiles) {
        if (i < 0 || i >= n) continue;
        const prev = next.elevation[i];
        if (!byPrev.has(prev)) byPrev.set(prev, []);
        byPrev.get(prev)!.push(i);
        next.elevation[i] = Math.trunc(c.to);
      }
      for (const [prev, tiles] of byPrev) {
        undo.push({ kind: 'elevation', tiles, to: prev });
      }
    } else if (c.kind === 'wall') {
      const place = parseEdge(c.edge);
      if (!place || !inBounds(next, place.x, place.y)) continue;
      const before = next.walls.find(w => edgeKey(w.x, w.y, w.side) === c.edge);
      undo.push(
        before
          ? {
              kind: 'wall',
              edge: c.edge,
              to: before.kind,
              ...(before.kind === 'door' ? { open: Boolean(before.open) } : {}),
            }
          : { kind: 'wall', edge: c.edge, to: 'none' }
      );
      next.walls = next.walls.filter(w => edgeKey(w.x, w.y, w.side) !== c.edge);
      if (c.to !== 'none') {
        const wall: Wall = {
          x: place.x,
          y: place.y,
          side: place.side,
          kind: c.to as WallKind,
          height: WALL_HEIGHT[c.to as WallKind] ?? before?.height ?? 10,
          ...(c.to === 'door' ? { open: Boolean(c.open) } : {}),
        };
        next.walls.push(wall);
      }
    }
  }
  // Undo in reverse, so a tile changed twice ends where it began.
  return { doc: next, undo: undo.reverse() };
}

/* --- the path a move takes ------------------------------------------------- */

/**
 * The cheapest path from `from` to `to`, as the tiles stepped through in
 * order, `to` last and `from` not included. The same Dijkstra `reachable`
 * runs, keeping where each tile was reached from. Null when no path exists —
 * a token dragged over a wall by staff — and the caller treats the move as
 * a jump that crosses nothing.
 */
export function pathBetween(
  doc: TerrainDoc,
  from: Tile,
  to: Tile,
  blocked: ReadonlySet<number> = new Set()
): Tile[] | null {
  const walls = wallIndex(doc);
  const idx = (t: Tile) => t.y * doc.w + t.x;
  const start = idx(from);
  const goal = idx(to);
  if (start === goal) return [];
  const best = new Map<number, number>([[start, 0]]);
  const cameFrom = new Map<number, number>();
  const open: [number, Tile][] = [[0, from]];

  while (open.length > 0) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, tile] = open.shift()!;
    const here = idx(tile);
    if (here === goal) break;
    if (cost > (best.get(here) ?? Infinity)) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const next = { x: tile.x + dx, y: tile.y + dy };
        if (!inBounds(doc, next.x, next.y)) continue;
        const ni = idx(next);
        if (ni !== goal && blocked.has(ni)) continue;
        const step = stepCost(doc, tile, next, walls);
        if (step.feet === null) continue;
        const total = cost + step.feet;
        if (total >= (best.get(ni) ?? Infinity)) continue;
        best.set(ni, total);
        cameFrom.set(ni, here);
        open.push([total, next]);
      }
    }
  }
  if (!best.has(goal)) return null;
  const out: Tile[] = [];
  let cur = goal;
  while (cur !== start) {
    out.push({ x: cur % doc.w, y: Math.floor(cur / doc.w) });
    const prev = cameFrom.get(cur);
    if (prev === undefined) return null;
    cur = prev;
  }
  return out.reverse();
}

/* --- light and vision -------------------------------------------------------- */

export interface Seer {
  x: number;
  y: number;
  footprint: number;
  /** Feet of darkvision; null for normal sight. */
  visionFeet: number | null;
}

export interface Torch {
  x: number;
  y: number;
  radiusFeet: number;
}

/**
 * Whether a tile is lit: the board's ambient light, or within a light's
 * radius — a brazier on the terrain or a torch a token carries. Dim counts
 * as lit for seeing; the disadvantage it carries is another spec's problem.
 */
export function litAt(
  doc: TerrainDoc,
  tile: Tile,
  torches: readonly Torch[]
): boolean {
  if (doc.ambient !== 'dark') return true;
  const feet = (a: Tile, b: Tile) =>
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5;
  for (const l of doc.lights) {
    if (feet(tile, l) <= l.radius) return true;
  }
  for (const t of torches) {
    if (feet(tile, t) <= t.radiusFeet) return true;
  }
  return false;
}

/**
 * Whether a seer standing here could see this tile right now: a line to it
 * that nothing blocks, and either the tile is lit or it is within the
 * seer's own darkvision. `canSee` is passed in so this module does not
 * import the sight test's geometry twice.
 */
export function seesTile(
  doc: TerrainDoc,
  seer: Seer,
  tile: Tile,
  torches: readonly Torch[],
  canSee: (doc: TerrainDoc, from: Tile, to: Tile) => boolean,
  radiusFeet: number
): boolean {
  const feet =
    Math.max(Math.abs(seer.x - tile.x), Math.abs(seer.y - tile.y)) * 5;
  if (feet > radiusFeet) return false;
  if (!canSee(doc, { x: seer.x, y: seer.y }, tile)) return false;
  if (litAt(doc, tile, torches)) return true;
  return seer.visionFeet !== null && feet <= seer.visionFeet;
}
