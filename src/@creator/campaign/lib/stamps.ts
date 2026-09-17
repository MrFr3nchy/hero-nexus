/**
 * Stamps: pieces of a floor that go down in one tap.
 *
 * A grove, a pond, a staircase, a cottage. Each is a `Fragment` built
 * from a small pattern, with a category and a note for the workshop's
 * shelf. The tall ones — a watchtower — say how many floors they stand
 * through; the workshop builds the floors above and links the stairs.
 * Pure, like everything beside it.
 */
import type { Fragment } from './board-edit';
import type { Wall } from '@/@shared/battlemap/types';

export type StampCategory = 'Nature' | 'Stairs' | 'Furniture' | 'Buildings';
export const STAMP_CATEGORIES: readonly StampCategory[] = [
  'Nature',
  'Stairs',
  'Furniture',
  'Buildings',
];

export interface Stamp {
  id: string;
  cat: StampCategory;
  name: string;
  /** One line under the name: "blocks", "links two floors". */
  note: string;
  /** Whether it links floors — drawn in gold on the shelf. */
  link?: boolean;
  /** Floors it stands through; the workshop adds the ones above. */
  floors?: number;
  fragment: Fragment;
  /**
   * A preview cell per tile, for the shelf: a colour key from `CELL`, or a
   * space for nothing.
   */
  preview: string[];
}

/** Colours for the shelf's previews, by pattern letter. */
export const CELL: Record<string, string> = {
  '#': '#d8ccb4',
  '.': '#5a4328',
  T: '#5f7d43',
  '~': '#2c3f52',
  '=': '#9c8763',
  '@': '#9c8763',
  t: '#7a5c3a',
  b: '#8a78a8',
  h: '#b5543f',
  s: '#7a5c3a',
  d: '#d9b061',
  g: '#3b4a2e',
  ' ': 'transparent',
};

const STONE = 1;
const GRASS = 3;
const WOOD = 4;
const WATER = 5;

function empty(w: number, h: number): Fragment {
  return {
    w,
    h,
    material: new Array(w * h).fill(null),
    elevation: new Array(w * h).fill(null),
    walls: [],
    props: [],
    lights: [],
    rooms: [],
  };
}

/** A pattern of rows into a fragment, one letter per tile. */
function fromPattern(
  rows: string[],
  read: (ch: string, x: number, y: number, f: Fragment) => void
): { fragment: Fragment; preview: string[] } {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const f = empty(w, h);
  const preview: string[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ' ';
      preview.push(ch);
      read(ch, x, y, f);
    }
  });
  return { fragment: f, preview };
}

/** A walled building: a box of floor, walls round it, a door in the south wall. */
function building(
  w: number,
  h: number,
  doorX: number,
  floor: number,
  inner?: (x: number, y: number, f: Fragment) => string | null
): { fragment: Fragment; preview: string[] } {
  const f = empty(w, h);
  const preview: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      f.material[y * w + x] = floor;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      let ch = '.';
      if (edge && y === h - 1 && x === doorX) ch = 'd';
      else if (edge) ch = '#';
      else if (inner) ch = inner(x, y, f) ?? '.';
      preview.push(ch);
    }
  }
  const wall = (
    x: number,
    y: number,
    side: Wall['side'],
    door = false
  ): Wall => ({
    x,
    y,
    side,
    kind: door ? 'door' : 'solid',
    height: 10,
    ...(door ? { open: false } : {}),
  });
  for (let x = 0; x < w; x++) {
    f.walls.push(wall(x, 0, 'n'));
    f.walls.push(wall(x, h - 1, 's', x === doorX));
  }
  for (let y = 0; y < h; y++) {
    f.walls.push(wall(0, y, 'w'));
    f.walls.push(wall(w - 1, y, 'e'));
  }
  return { fragment: f, preview };
}

function make(
  id: string,
  cat: StampCategory,
  name: string,
  note: string,
  built: { fragment: Fragment; preview: string[] },
  extra: Partial<Pick<Stamp, 'link' | 'floors'>> = {}
): Stamp {
  return { id, cat, name, note, ...built, ...extra };
}

export const STAMPS: readonly Stamp[] = [
  make(
    'grove',
    'Nature',
    'Grove',
    'trees, some gaps',
    fromPattern(
      [' T T ', 'T T T', ' T T ', 'T T T', ' T T '],
      (ch, x, y, f) => {
        if (ch === 'T') f.props.push({ x, y, kind: 'tree', blocks: true });
      }
    )
  ),
  make(
    'hedge',
    'Nature',
    'Hedge row',
    'blocks, drawn along edges',
    fromPattern(['TTTTTT'], (ch, x, y, f) => {
      f.walls.push({ x, y, side: 'n', kind: 'hedge', height: 6 });
    })
  ),
  make(
    'pond',
    'Nature',
    'Pond',
    'difficult terrain',
    fromPattern(['g~g', '~~~', 'g~~'], (ch, x, y, f) => {
      f.material[y * f.w + x] = ch === '~' ? WATER : GRASS;
    })
  ),
  make(
    'stair',
    'Stairs',
    'Staircase',
    'links two floors',
    (() => {
      const built = fromPattern(['==', '==', '=='], () => {});
      built.fragment.link = { kind: 'stairs', x: 0, y: 0, w: 2, h: 3 };
      return built;
    })(),
    { link: true }
  ),
  make(
    'spiral',
    'Stairs',
    'Spiral stair',
    'links any floors',
    (() => {
      const built = fromPattern(['@@', '@@'], () => {});
      built.fragment.link = { kind: 'stairs', x: 0, y: 0, w: 2, h: 2 };
      return built;
    })(),
    { link: true }
  ),
  make(
    'banquet',
    'Furniture',
    'Banquet table',
    'blocks',
    fromPattern(['ttttt', 'ttttt'], (ch, x, y, f) => {
      f.props.push({ x, y, kind: 'table', blocks: true });
    })
  ),
  make(
    'bed',
    'Furniture',
    'Four-poster',
    'blocks',
    fromPattern(['bb', 'bb', 'bb'], (ch, x, y, f) => {
      f.props.push({ x, y, kind: 'bed', blocks: true });
    })
  ),
  make(
    'hearth',
    'Furniture',
    'Hearth',
    'comes with a light',
    fromPattern(['hhh'], (ch, x, y, f) => {
      f.props.push({ x, y, kind: 'hearth', blocks: true });
      if (x === 1) f.lights.push({ x, y, radius: 20 });
    })
  ),
  make('cottage', 'Buildings', 'Cottage', '1 floor', building(8, 6, 3, WOOD), {
    link: true,
  }),
  make(
    'tower',
    'Buildings',
    'Watchtower',
    '3 floors, stairs linked',
    (() => {
      const built = building(5, 5, 2, STONE, (x, y) =>
        x === 2 && y === 2 ? '@' : null
      );
      built.fragment.link = { kind: 'stairs', x: 2, y: 2, w: 1, h: 1 };
      return built;
    })(),
    { link: true, floors: 3 }
  ),
];

export function findStamp(id: string): Stamp | undefined {
  return STAMPS.find(s => s.id === id);
}
