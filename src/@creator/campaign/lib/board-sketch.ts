/**
 * One floor of a battle board as text, for a model to place creatures on,
 * and the check every placement it returns must pass. Pure.
 *
 * A grid of tile characters with its rows and columns numbered, and the
 * walls and rooms listed beside it rather than drawn into it: a model counts
 * a row of single characters far more reliably than a doubled grid with
 * edges between the tiles.
 */

import {
  inBounds,
  materialAt,
  type Side,
  type TerrainDoc,
} from '@/@shared/battlemap/types';

const at = (x: number, y: number) => `${x},${y}`;

/** Whether a creature may be put down on this tile. */
export function canStand(
  doc: TerrainDoc,
  taken: ReadonlySet<string>,
  x: number,
  y: number
): boolean {
  if (!inBounds(doc, x, y)) return false;
  const m = materialAt(doc, x, y);
  if (m.key === 'void' || m.impassable) return false;
  if (doc.props.some(p => p.x === x && p.y === y && p.blocks)) return false;
  return !taken.has(at(x, y));
}

/** `taken` as the set `canStand` reads. */
export function takenTiles(
  taken: { x: number; y: number; footprint: number }[]
): Set<string> {
  const out = new Set<string>();
  for (const t of taken) {
    const size = Math.max(1, t.footprint);
    for (let dx = 0; dx < size; dx++)
      for (let dy = 0; dy < size; dy++) out.add(at(t.x + dx, t.y + dy));
  }
  return out;
}

const SIDE_WORD: Record<Side, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
};

/** Walls as runs: "solid wall on the north edge of x 3–9, y 4". */
function wallRuns(doc: TerrainDoc): string[] {
  const groups = new Map<string, number[]>();
  for (const w of doc.walls) {
    const across = w.side === 'n' || w.side === 's';
    const kind = w.kind === 'door' ? (w.open ? 'open door' : 'door') : w.kind;
    const key = `${kind}|${w.side}|${across ? w.y : w.x}`;
    const list = groups.get(key) ?? [];
    list.push(across ? w.x : w.y);
    groups.set(key, list);
  }
  const out: string[] = [];
  for (const [key, list] of groups) {
    const [kind, side, fixed] = key.split('|');
    const across = side === 'n' || side === 's';
    const sorted = [...new Set(list)].sort((a, b) => a - b);
    let start = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue;
      const end = sorted[i - 1];
      const span = start === end ? `${start}` : `${start}-${end}`;
      out.push(
        `${kind} on the ${SIDE_WORD[side as Side]} edge of ${
          across ? `x ${span}, y ${fixed}` : `x ${fixed}, y ${span}`
        }`
      );
      start = sorted[i];
    }
  }
  return out;
}

export function sketchLevel(
  doc: TerrainDoc,
  taken: ReadonlySet<string>
): string {
  const rows: string[] = [];
  const ruler = Array.from({ length: doc.w }, (_, x) =>
    x % 5 === 0 ? String(Math.floor(x / 10) % 10) : ' '
  ).join('');
  const units = Array.from({ length: doc.w }, (_, x) => String(x % 10)).join(
    ''
  );
  rows.push(`     ${ruler}`, `     ${units}`);
  for (let y = 0; y < doc.h; y++) {
    let line = '';
    for (let x = 0; x < doc.w; x++) {
      const m = materialAt(doc, x, y);
      const prop = doc.props.find(p => p.x === x && p.y === y);
      line +=
        m.key === 'void' || m.impassable
          ? '#'
          : taken.has(at(x, y))
            ? 'X'
            : prop?.blocks
              ? 'O'
              : m.difficult
                ? '~'
                : prop
                  ? 'p'
                  : '.';
    }
    rows.push(`${String(y).padStart(4, ' ')} ${line}`);
  }

  const walls = wallRuns(doc);
  const rooms = (doc.rooms ?? []).map(
    r => `${r.name}: x ${r.x}-${r.x + r.w - 1}, y ${r.y}-${r.y + r.h - 1}`
  );
  return [
    `A grid ${doc.w} tiles wide (x 0-${doc.w - 1}, left to right) and ${doc.h} tall (y 0-${doc.h - 1}, top to bottom). Each tile is 5 feet.`,
    'Key: . floor   ~ difficult terrain   p something on the floor, can be stood on   O blocks standing   X someone already there   # no floor',
    ...rows,
    walls.length ? `Walls:\n${walls.join('\n')}` : 'No walls.',
    rooms.length ? `Rooms:\n${rooms.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
