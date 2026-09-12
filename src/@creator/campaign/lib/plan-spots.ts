/**
 * Where a planned monster's copies stand when the plan is dealt onto a
 * board. Pure: the server stores and deals from these, the planner draws
 * them, and neither re-implements the shape.
 */

export interface PlanSpot {
  mapId: string;
  x: number;
  y: number;
}

/** Keep what is a spot; drop the rest. At most `count` of them. */
export function sanitizeSpots(raw: unknown, count: number): PlanSpot[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanSpot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    if (typeof s.mapId !== 'string' || !s.mapId) continue;
    const x = Number(s.x);
    const y = Number(s.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
      continue;
    }
    out.push({ mapId: s.mapId, x, y });
    if (out.length >= count) break;
  }
  return out;
}
