/**
 * Universal VTT (`.dd2vtt`, `.df2vtt`, `.uvtt`) — the geometry half (7c).
 *
 * A Universal VTT file is one JSON document: a baked map image (base64),
 * the map's size in grid squares, free-form wall polylines in grid units
 * (`line_of_sight`, and newer exporters' `objects_line_of_sight`), doors
 * (`portals`) and lights. Our board is tiles with walls on tile *edges*, so
 * the import is lossy on purpose:
 *
 * - every wall segment is snapped to the tile edges it runs along — a
 *   diagonal becomes a staircase of edges;
 * - a portal becomes a door on the edges its bounds cover, open or shut as
 *   the file says;
 * - a light becomes a light on the tile it stands in, its range in squares
 *   times five feet;
 * - the picture becomes the floor's `backdrop`, uploaded separately (the
 *   browser does that: the image is routinely bigger than a request may be).
 *
 * A map larger than the board allows is refused with its size, never cropped.
 *
 * Pure: no React, no server. Tests in `uvtt.test.ts`.
 */
import {
  MAX_SIDE,
  MIN_SIDE,
  TILE_FEET,
  edgeKey,
  type Light,
  type Side,
  type Wall,
} from './types';

interface Point {
  x: number;
  y: number;
}

export interface UvttGeometry {
  /** Grid squares across and down. */
  w: number;
  h: number;
  walls: Wall[];
  lights: Light[];
  /** The base64 picture, without any data-URL prefix, or null. */
  image: string | null;
  /** Pixels per square in the picture, for sizing it on the way in. */
  pixelsPerGrid: number | null;
  /** What did not carry over, in words. */
  notes: string[];
}

export type UvttResult =
  | { ok: true; geometry: UvttGeometry }
  | { ok: false; error: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function point(v: unknown, origin: Point): Point | null {
  const p = obj(v);
  const x = Number(p.x);
  const y = Number(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: x - origin.x, y: y - origin.y };
}

function polyline(v: unknown, origin: Point): Point[] {
  return arr(v)
    .map(p => point(p, origin))
    .filter((p): p is Point => p !== null);
}

/**
 * The tile edges a straight segment runs along, as `{x, y, side}` in this
 * board's terms.
 *
 * A walk over grid corners, from the corner nearest one end to the corner
 * nearest the other, one unit at a time, each step taken along whichever
 * axis stays closer to the true line (Bresenham, on corners). A segment on a
 * grid line gives exactly the edges under it; a diagonal gives one
 * connected staircase — never both sides of a tile.
 */
export function edgesAlong(
  a: Point,
  b: Point,
  w: number,
  h: number
): { x: number; y: number; side: Side }[] {
  const out = new Map<string, { x: number; y: number; side: Side }>();
  let cx = Math.round(a.x);
  let cy = Math.round(a.y);
  const ex = Math.round(b.x);
  const ey = Math.round(b.y);
  const sx = Math.sign(ex - cx);
  const sy = Math.sign(ey - cy);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Distance of a corner from the true line, for choosing each step.
  const off = (x: number, y: number) =>
    Math.abs((x - a.x) * dy - (y - a.y) * dx) / len;
  const put = (e: { x: number; y: number; side: Side }) =>
    out.set(edgeKey(e.x, e.y, e.side), e);

  for (let guard = 0; guard < 4 * (w + h) + 8; guard++) {
    if (cx === ex && cy === ey) break;
    const canX = cx !== ex;
    const canY = cy !== ey;
    const goX = canX && (!canY || off(cx + sx, cy) <= off(cx, cy + sy));
    if (goX) {
      // Along the horizontal line y = cy, across one column.
      const col = Math.min(cx, cx + sx);
      if (col >= 0 && col < w && cy >= 0 && cy <= h) {
        put(
          cy < h
            ? { x: col, y: cy, side: 'n' }
            : { x: col, y: h - 1, side: 's' }
        );
      }
      cx += sx;
    } else {
      // Along the vertical line x = cx, down one row.
      const row = Math.min(cy, cy + sy);
      if (row >= 0 && row < h && cx >= 0 && cx <= w) {
        put(
          cx < w
            ? { x: cx, y: row, side: 'w' }
            : { x: w - 1, y: row, side: 'e' }
        );
      }
      cy += sy;
    }
  }
  return [...out.values()];
}

/** Read a Universal VTT document into board geometry, or say why not. */
export function parseUvtt(input: unknown): UvttResult {
  const doc = obj(input);
  const res = obj(doc.resolution);
  const size = obj(res.map_size);
  const sw = Number(size.x);
  const sh = Number(size.y);
  if (!Number.isFinite(sw) || !Number.isFinite(sh) || sw <= 0 || sh <= 0) {
    return {
      ok: false,
      error:
        'That is not a Universal VTT map: it has no resolution.map_size. Export it again as Universal VTT (.dd2vtt).',
    };
  }
  const w = Math.ceil(sw - 1e-6);
  const h = Math.ceil(sh - 1e-6);
  if (w > MAX_SIDE || h > MAX_SIDE) {
    return {
      ok: false,
      error: `That map is ${w} × ${h} squares; a battle board goes up to ${MAX_SIDE} × ${MAX_SIDE}. Split it in the program that made it and import the parts.`,
    };
  }
  if (w < MIN_SIDE || h < MIN_SIDE) {
    return {
      ok: false,
      error: `That map is ${w} × ${h} squares; a battle board is at least ${MIN_SIDE} × ${MIN_SIDE}.`,
    };
  }
  const origin = point(res.map_origin, { x: 0, y: 0 }) ?? { x: 0, y: 0 };
  const notes: string[] = [];

  // Walls: every polyline's segments, onto edges.
  const wallEdges = new Map<string, Wall>();
  const lines = [...arr(doc.line_of_sight), ...arr(doc.objects_line_of_sight)];
  let diagonal = false;
  for (const line of lines) {
    const pts = polyline(line, origin);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      if (Math.abs(a.x - b.x) > 1e-3 && Math.abs(a.y - b.y) > 1e-3) {
        diagonal = true;
      }
      for (const e of edgesAlong(a, b, w, h)) {
        wallEdges.set(edgeKey(e.x, e.y, e.side), {
          ...e,
          kind: 'solid',
          height: 0,
        });
      }
    }
  }
  if (diagonal) {
    notes.push('Diagonal and curved walls are stepped along the grid.');
  }

  // Doors replace whatever wall was on their edges.
  let doors = 0;
  for (const p of arr(doc.portals)) {
    const portal = obj(p);
    const bounds = polyline(portal.bounds, origin);
    if (bounds.length < 2) continue;
    const open = portal.closed === false;
    for (const e of edgesAlong(bounds[0], bounds[bounds.length - 1], w, h)) {
      wallEdges.set(edgeKey(e.x, e.y, e.side), {
        ...e,
        kind: 'door',
        height: 0,
        open,
      });
    }
    doors += 1;
  }
  if (doors > 0 && arr(doc.portals).some(p => obj(p).freestanding === true)) {
    notes.push('Free-standing portals came in as doors on the grid.');
  }

  // Lights, on the tile they stand in.
  const lights: Light[] = [];
  const lit = new Set<string>();
  for (const l of arr(doc.lights)) {
    const light = obj(l);
    const at = point(light.position, origin);
    const range = Number(light.range);
    if (!at) continue;
    const x = Math.min(w - 1, Math.max(0, Math.floor(at.x)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(at.y)));
    if (lit.has(`${x},${y}`)) continue;
    lit.add(`${x},${y}`);
    lights.push({
      x,
      y,
      // Range is in squares; a square is five feet.
      radius: Math.max(
        TILE_FEET,
        Math.round(Number.isFinite(range) ? range : 3) * TILE_FEET
      ),
    });
  }
  if (lights.length > 0) {
    notes.push("Lights keep their place and reach; their colours don't carry.");
  }

  const raw = typeof doc.image === 'string' ? doc.image : '';
  const image = raw ? raw.replace(/^data:[^,]*,/, '') : null;
  const ppg = Number(res.pixels_per_grid);

  return {
    ok: true,
    geometry: {
      w,
      h,
      walls: [...wallEdges.values()],
      lights: lights.slice(0, 300),
      image,
      pixelsPerGrid: Number.isFinite(ppg) && ppg > 0 ? ppg : null,
      notes,
    },
  };
}

/**
 * How big to make the picture: about `perSquare` pixels a square, and no
 * side over `maxSide` — a texture any phone's GPU takes, and a file that
 * fits the 8 MB image limit once encoded.
 */
export function backdropSize(
  w: number,
  h: number,
  perSquare = 140,
  maxSide = 4096
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(w * perSquare, h * perSquare));
  return {
    width: Math.max(1, Math.round(w * perSquare * scale)),
    height: Math.max(1, Math.round(h * perSquare * scale)),
  };
}
