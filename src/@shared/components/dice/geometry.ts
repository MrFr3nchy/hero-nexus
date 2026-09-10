/**
 * The polyhedra, drawn.
 *
 * Each die is a flat projection in a 100x100 box: one silhouette, a set of
 * facets, and the spot where its number goes. The facets are not decoration —
 * they are what makes a d12 read as a d12 and not as "a pentagon with a
 * number in it", which is the whole reason a table can tell its dice apart
 * across the room.
 *
 * `shade` is how much shadow a facet carries, 0 (facing the light) to 1
 * (turned away), with the light up and to the left. It is painted as black at
 * a low alpha rather than as a mix toward a token, because `--surface` is pale
 * in the parchment palette and dark in the candlelight one: mixing would
 * invert the lighting between themes, and black does not.
 *
 * The d6 is absent on purpose. A cube is the one die whose real 3D is cheap —
 * six divs and a `preserve-3d` — so it is built as an actual rotating solid in
 * `Die.tsx` instead of projected here.
 */

export interface Facet {
  points: string;
  shade: number;
}

export interface DieShape {
  /** Outer edge, used for the fill, the rim stroke, and the drop shadow. */
  silhouette: string;
  facets: Facet[];
  /** Where the rolled number sits, inside the lit face. */
  label: { x: number; y: number; size: number };
  /** Rendered small under the number — the d100's percent mark. */
  suffix?: { text: string; x: number; y: number; size: number };
}

/** Tetrahedron: three visible faces meeting at a projected back vertex. */
const D4: DieShape = {
  silhouette: '50,5 95,91 5,91',
  facets: [
    { points: '5,91 95,91 50,56', shade: 0 },
    { points: '50,5 5,91 50,56', shade: 0.2 },
    { points: '50,5 50,56 95,91', shade: 0.44 },
  ],
  label: { x: 50, y: 76, size: 21 },
};

/** Octahedron stood on a face: a broad front triangle under a shallow roof. */
const D8: DieShape = {
  silhouette: '50,4 94,38 50,96 6,38',
  facets: [
    { points: '6,38 94,38 50,96', shade: 0 },
    { points: '50,4 6,38 50,38', shade: 0.16 },
    { points: '50,4 50,38 94,38', shade: 0.4 },
  ],
  label: { x: 50, y: 64, size: 29 },
};

/** Pentagonal trapezohedron — the kite-faced d10. */
const D10: DieShape = {
  silhouette: '50,3 93,38 76,92 24,92 7,38',
  facets: [
    { points: '50,3 28,48 50,70 72,48', shade: 0 },
    { points: '50,3 7,38 15.2,64 28,48', shade: 0.14 },
    { points: '50,3 72,48 84.8,64 93,38', shade: 0.38 },
    { points: '28,48 15.2,64 24,92 50,70', shade: 0.3 },
    { points: '72,48 50,70 76,92 84.8,64', shade: 0.56 },
    { points: '50,70 24,92 76,92', shade: 0.48 },
  ],
  label: { x: 50, y: 46, size: 27 },
};

/** The same solid as the d10, marked as the percentile die. */
const D100: DieShape = {
  ...D10,
  label: { x: 50, y: 41, size: 21 },
  suffix: { text: '%', x: 50, y: 58, size: 11 },
};

/** Dodecahedron face-on: a decagon silhouette around a pentagonal face. */
const D12: DieShape = {
  silhouette: '50,3 78,12 95,36 95,64 78,88 50,97 22,88 5,64 5,36 22,12',
  facets: [
    { points: '50,30 31,44 38,66 62,66 69,44', shade: 0 },
    { points: '31,44 5,36 22,12 50,3 50,30', shade: 0.12 },
    { points: '50,30 50,3 78,12 95,36 69,44', shade: 0.34 },
    { points: '38,66 22,88 5,64 5,36 31,44', shade: 0.26 },
    { points: '69,44 95,36 95,64 78,88 62,66', shade: 0.52 },
    { points: '62,66 78,88 50,97 22,88 38,66', shade: 0.46 },
  ],
  label: { x: 50, y: 51, size: 25 },
};

/** Icosahedron face-on: the ten faces a d20 actually shows you. */
const D20: DieShape = {
  silhouette: '50,3 91,26 91,74 50,97 9,74 9,26',
  facets: [
    { points: '50,28 31,61 69,61', shade: 0 },
    { points: '9,26 50,3 50,28', shade: 0.1 },
    { points: '50,3 91,26 50,28', shade: 0.3 },
    { points: '50,28 31,61 9,26', shade: 0.22 },
    { points: '50,28 69,61 91,26', shade: 0.42 },
    { points: '9,26 31,61 9,74', shade: 0.34 },
    { points: '91,26 91,74 69,61', shade: 0.54 },
    { points: '31,61 69,61 50,97', shade: 0.5 },
    { points: '9,74 31,61 50,97', shade: 0.44 },
    { points: '91,74 50,97 69,61', shade: 0.66 },
  ],
  label: { x: 50, y: 50, size: 20 },
};

const SHAPES: Record<number, DieShape> = {
  4: D4,
  8: D8,
  10: D10,
  12: D12,
  20: D20,
  100: D100,
};

/**
 * The solid for a die size. An unknown size — homebrew notation allows up to
 * d1000 — borrows the d20's, which is the shape people picture when they hear
 * "a die" and reads honestly as "some polyhedron" at any face value.
 */
export function shapeFor(sides: number): DieShape {
  return SHAPES[sides] ?? D20;
}
