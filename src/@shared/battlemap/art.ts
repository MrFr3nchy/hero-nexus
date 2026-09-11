/**
 * The sand table's surfaces, drawn rather than downloaded.
 *
 * Every floor, wall and cliff face on the board is a small canvas painted
 * here: flagstones with mortar, planks with grain, grass as strokes, lava as
 * crust and cracks. Procedural because the app makes no outbound calls and
 * ships no texture pack, and because a texture drawn from the palette's own
 * swatches stays in the palette — the parchment board and the candlelit one
 * each get their own set.
 *
 * Shared by both boards on purpose: the 2D board draws these as the tiles
 * themselves, the 3D view wraps them onto the extruded boxes, so a tile of
 * boards looks like the same boards from above and from the side. One
 * canvas per (look, palette), drawn once and kept.
 *
 * Nothing here is random at draw time. Every generator is seeded so the same
 * stone cracks the same way on every rebuild — a floor that re-tiled itself
 * on every token move would be motion nobody asked for (design rule 4).
 *
 * Canvas 2D only. No `three`, no React, no `server-only`.
 */
import { MATERIALS } from './types';

/** Pixels on a side. One tile in 3D; scaled to fit in 2D. */
export const ART_SIZE = 128;

/* --- small helpers ----------------------------------------------------- */

/** mulberry32: small, fast, and the same sequence every time for a seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h,
    16
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (+) or darken (−) a hex colour by a fraction of the way to white/black. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex);
  const to = amount >= 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amount));
  const f = (c: number) => Math.round(c + (to - c) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

const cache = new Map<string, HTMLCanvasElement>();

function canvas(
  w = ART_SIZE,
  h = ART_SIZE
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function speckle(
  ctx: CanvasRenderingContext2D,
  r: () => number,
  n: number,
  light: string,
  dark: string,
  size = 1.5
) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = r() < 0.5 ? light : dark;
    const s = size * (0.6 + r() * 0.8);
    ctx.fillRect(r() * ART_SIZE, r() * ART_SIZE, s, s);
  }
}

/** A faint darker line round the edge, so the five-foot grid reads in 3D. */
function edge(ctx: CanvasRenderingContext2D, base: string) {
  ctx.strokeStyle = shade(base, -0.35);
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, ART_SIZE - 2, ART_SIZE - 2);
  ctx.globalAlpha = 1;
}

/* --- floors ------------------------------------------------------------ */

function flagstones(ctx: CanvasRenderingContext2D, base: string, seed: number) {
  const r = rng(seed);
  const S = ART_SIZE;
  ctx.fillStyle = shade(base, -0.28);
  ctx.fillRect(0, 0, S, S);
  // Two rows of stones, the second row's seam staggered, the seams jittered
  // so the stone is not a chessboard.
  const ySplit = S * (0.45 + r() * 0.12);
  const rows: [number, number][] = [
    [0, ySplit],
    [ySplit, S],
  ];
  rows.forEach(([y0, y1], row) => {
    const xSplit = row === 0 ? S * (0.4 + r() * 0.2) : S * (0.55 + r() * 0.2);
    const cells: [number, number][] = [
      [0, xSplit],
      [xSplit, S],
    ];
    for (const [x0, x1] of cells) {
      const tone = shade(base, (r() - 0.5) * 0.16);
      ctx.fillStyle = tone;
      const m = 2.5;
      ctx.beginPath();
      // A stone's corners wander a pixel or two, which is what makes it a stone.
      const j = () => (r() - 0.5) * 3;
      ctx.moveTo(x0 + m + j(), y0 + m + j());
      ctx.lineTo(x1 - m + j(), y0 + m + j());
      ctx.lineTo(x1 - m + j(), y1 - m + j());
      ctx.lineTo(x0 + m + j(), y1 - m + j());
      ctx.closePath();
      ctx.fill();
      // A worn highlight along the top-left, a shadow along the bottom-right.
      ctx.strokeStyle = shade(base, 0.22);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0 + m + 1, y1 - m - 1);
      ctx.lineTo(x0 + m + 1, y0 + m + 1);
      ctx.lineTo(x1 - m - 1, y0 + m + 1);
      ctx.stroke();
      ctx.strokeStyle = shade(base, -0.3);
      ctx.beginPath();
      ctx.moveTo(x1 - m - 1, y0 + m + 1);
      ctx.lineTo(x1 - m - 1, y1 - m - 1);
      ctx.lineTo(x0 + m + 1, y1 - m - 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });
  speckle(ctx, r, 160, shade(base, 0.12), shade(base, -0.18));
}

function dirt(ctx: CanvasRenderingContext2D, base: string, seed: number) {
  const r = rng(seed);
  const S = ART_SIZE;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  // Soft blotches, then grit, then a few pebbles.
  for (let i = 0; i < 9; i++) {
    const g = ctx.createRadialGradient(
      r() * S,
      r() * S,
      0,
      r() * S,
      r() * S,
      S * (0.2 + r() * 0.3)
    );
    g.addColorStop(0, rgba(r() < 0.5 ? '#000000' : '#ffffff', 0.08));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  speckle(ctx, r, 420, shade(base, 0.14), shade(base, -0.22), 1.6);
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = shade(base, -0.3 + r() * 0.5);
    ctx.beginPath();
    ctx.ellipse(r() * S, r() * S, 2 + r() * 3, 1.5 + r() * 2, r() * 3, 0, 7);
    ctx.fill();
  }
}

function grass(ctx: CanvasRenderingContext2D, base: string, seed: number) {
  const r = rng(seed);
  const S = ART_SIZE;
  ctx.fillStyle = shade(base, -0.08);
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, r, 200, shade(base, 0.1), shade(base, -0.15), 2);
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * S;
    const y = r() * S;
    const len = 3 + r() * 5;
    const lean = (r() - 0.5) * 3;
    ctx.strokeStyle = shade(base, r() < 0.5 ? 0.18 : -0.2);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lean, y - len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Planks, seams along `along`. Floors run east–west; a door's staves run up. */
export function planks(
  ctx: CanvasRenderingContext2D,
  base: string,
  seed: number,
  along: 'x' | 'y',
  count = 4,
  bands = false
) {
  const r = rng(seed);
  const S = ART_SIZE;
  ctx.fillStyle = shade(base, -0.4);
  ctx.fillRect(0, 0, S, S);
  const w = S / count;
  for (let k = 0; k < count; k++) {
    const tone = shade(base, (r() - 0.5) * 0.18);
    const a = k * w + 1.5;
    ctx.fillStyle = tone;
    if (along === 'x') ctx.fillRect(0, a, S, w - 3);
    else ctx.fillRect(a, 0, w - 3, S);
    // Grain: a few long wavering lines down each plank.
    ctx.strokeStyle = shade(base, -0.28);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const off = a + 3 + r() * (w - 6);
      ctx.beginPath();
      for (let t = 0; t <= S; t += 8) {
        const wobble = Math.sin((t / S) * Math.PI * (1 + r() * 2) + g) * 1.2;
        if (along === 'x') {
          if (t === 0) ctx.moveTo(t, off + wobble);
          else ctx.lineTo(t, off + wobble);
        } else if (t === 0) ctx.moveTo(off + wobble, t);
        else ctx.lineTo(off + wobble, t);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // A knot, sometimes.
    if (r() < 0.4) {
      ctx.fillStyle = shade(base, -0.35);
      const kx = along === 'x' ? r() * S : a + w / 2;
      const ky = along === 'x' ? a + w / 2 : r() * S;
      ctx.beginPath();
      ctx.ellipse(kx, ky, 3, 2, 0, 0, 7);
      ctx.fill();
    }
  }
  if (bands) {
    // Iron bands across the staves: a barrel's hoops, a door's strapping.
    ctx.fillStyle = '#2a2622';
    ctx.globalAlpha = 0.85;
    for (const y of [S * 0.22, S * 0.74]) {
      ctx.fillRect(0, y, S, 7);
      ctx.fillStyle = '#4a4440';
      ctx.fillRect(0, y + 1, S, 2);
      ctx.fillStyle = '#2a2622';
    }
    ctx.globalAlpha = 1;
  }
}

function water(ctx: CanvasRenderingContext2D, base: string, seed: number) {
  const r = rng(seed);
  const S = ART_SIZE;
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, shade(base, 0.06));
  g.addColorStop(1, shade(base, -0.14));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Still ripples: a handful of soft light arcs, drawn once.
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {
    const y = r() * S;
    const amp = 2 + r() * 3;
    const freq = 1 + r() * 2;
    ctx.strokeStyle = shade(base, 0.3);
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    for (let x = -4; x <= S + 4; x += 6) {
      const yy = y + Math.sin((x / S) * Math.PI * 2 * freq + i) * amp;
      if (x === -4) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function rubble(ctx: CanvasRenderingContext2D, base: string, seed: number) {
  const r = rng(seed);
  const S = ART_SIZE;
  dirt(ctx, shade(base, -0.12), seed);
  for (let i = 0; i < 14; i++) {
    const cx = r() * S;
    const cy = r() * S;
    const rad = 5 + r() * 8;
    ctx.fillStyle = shade(base, -0.05 + r() * 0.25);
    ctx.beginPath();
    const n = 5 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = rad * (0.7 + r() * 0.5);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.75;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(base, -0.4);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function lava(ctx: CanvasRenderingContext2D, base: string, seed: number) {
  const r = rng(seed);
  const S = ART_SIZE;
  // Crust, then the glow through the cracks.
  ctx.fillStyle = '#2a1410';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, r, 300, '#3a1c14', '#1c0c08', 2);
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    let x = r() * S;
    let y = r() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 50;
      y += (r() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = base;
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.strokeStyle = '#ffb060';
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
}

/**
 * The floor for a material, in the palette asked for. Null for void, which
 * is drawn as nothing by both boards on purpose — the fog filter made it
 * void, and a texture for "unknown" would leak the shape of a room.
 */
export function floorArt(
  materialKey: string,
  dark: boolean
): HTMLCanvasElement | null {
  if (materialKey === 'void') return null;
  const key = `floor:${materialKey}:${dark ? 'd' : 'l'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = MATERIALS.find(m => m.key === materialKey);
  if (!spec) return null;
  const base = dark ? spec.swatchDark : spec.swatch;
  const [c, ctx] = canvas();
  const seed = 11 + materialKey.length * 7;
  switch (materialKey) {
    case 'stone':
      flagstones(ctx, base, seed);
      break;
    case 'dirt':
      dirt(ctx, base, seed);
      break;
    case 'grass':
      grass(ctx, base, seed);
      break;
    case 'wood':
      planks(ctx, base, seed, 'x');
      break;
    case 'water':
      water(ctx, base, seed);
      break;
    case 'rubble':
      rubble(ctx, base, seed);
      break;
    case 'lava':
      lava(ctx, base, seed);
      break;
    default:
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, ART_SIZE, ART_SIZE);
  }
  edge(ctx, base);
  cache.set(key, c);
  return c;
}

/* --- walls and sides --------------------------------------------------- */

/** Running-bond stone: the face of a wall, a pillar, a pedestal. */
export function masonryArt(dark: boolean): HTMLCanvasElement {
  const key = `masonry:${dark ? 'd' : 'l'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas();
  const S = ART_SIZE;
  const r = rng(101);
  const stone = dark ? '#4a433a' : '#b8ae9c';
  ctx.fillStyle = shade(stone, -0.4);
  ctx.fillRect(0, 0, S, S);
  const rows = 4;
  const rh = S / rows;
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? -S / 4 : 0;
    for (let k = -1; k < 3; k++) {
      const x = off + k * (S / 2);
      const y = row * rh;
      ctx.fillStyle = shade(stone, (r() - 0.5) * 0.2);
      ctx.fillRect(x + 2, y + 2, S / 2 - 4, rh - 4);
      ctx.strokeStyle = shade(stone, 0.25);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(x + 2.5, y + rh - 2.5);
      ctx.lineTo(x + 2.5, y + 2.5);
      ctx.lineTo(x + S / 2 - 2.5, y + 2.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  speckle(ctx, r, 140, shade(stone, 0.1), shade(stone, -0.2));
  cache.set(key, c);
  return c;
}

/** Earth and bedrock in layers: the side of a raised tile, the drop of a pit. */
export function strataArt(dark: boolean): HTMLCanvasElement {
  const key = `strata:${dark ? 'd' : 'l'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas();
  const S = ART_SIZE;
  const r = rng(77);
  const earth = dark ? '#3e3428' : '#a8987e';
  ctx.fillStyle = earth;
  ctx.fillRect(0, 0, S, S);
  let y = 0;
  let k = 0;
  while (y < S) {
    const h = 10 + r() * 22;
    ctx.fillStyle = shade(earth, (r() - 0.5) * 0.22 - (k % 2 ? 0.06 : 0));
    ctx.fillRect(0, y, S, h);
    ctx.fillStyle = shade(earth, -0.35);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, y + h - 1.5, S, 1.5);
    ctx.globalAlpha = 1;
    y += h;
    k++;
  }
  speckle(ctx, r, 260, shade(earth, 0.12), shade(earth, -0.25), 1.8);
  cache.set(key, c);
  return c;
}

/** A door's face, a barrel's staves: planks standing up, strapped in iron. */
export function planksArt(dark: boolean, bands = true): HTMLCanvasElement {
  const key = `planks:${dark ? 'd' : 'l'}:${bands ? 'b' : 'p'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas();
  const wood = dark ? MATERIALS[4].swatchDark : MATERIALS[4].swatch;
  planks(ctx, wood, 31, 'y', 4, bands);
  cache.set(key, c);
  return c;
}

/* --- light and glow ---------------------------------------------------- */

/**
 * A soft white disc fading to nothing — tinted by whoever draws it. The
 * ground ring under a token, the pool of light under a brazier.
 */
export function glowArt(hole = 0): HTMLCanvasElement {
  const key = `glow:${hole}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas();
  const S = ART_SIZE;
  const g = ctx.createRadialGradient(
    S / 2,
    S / 2,
    (S / 2) * hole,
    S / 2,
    S / 2,
    S / 2
  );
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  cache.set(key, c);
  return c;
}

/** A brazier's flame, still. Drawn once; nothing on the board flickers. */
export function flameArt(): HTMLCanvasElement {
  const key = 'flame';
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(64, 96);
  const g = ctx.createRadialGradient(32, 66, 2, 32, 60, 34);
  g.addColorStop(0, 'rgba(255,245,200,1)');
  g.addColorStop(0.3, 'rgba(255,190,80,0.95)');
  g.addColorStop(0.65, 'rgba(230,100,30,0.6)');
  g.addColorStop(1, 'rgba(180,60,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  // A teardrop: wide at the coals, drawn up to a tip.
  ctx.moveTo(32, 4);
  ctx.bezierCurveTo(52, 34, 60, 62, 32, 92);
  ctx.bezierCurveTo(4, 62, 12, 34, 32, 4);
  ctx.closePath();
  ctx.fill();
  cache.set(key, c);
  return c;
}

/**
 * A tile a token can reach: an outlined square with a faint fill, the same
 * mark the 2D board draws. A texture rather than line geometry so the
 * outline has a width the camera cannot thin to nothing, and so a reach
 * that covers the whole room still reads as squares rather than a tint.
 */
export function reachArt(): HTMLCanvasElement {
  const key = 'reach';
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas();
  const S = ART_SIZE;
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(10, 10, S - 20, S - 20);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 5;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(12, 12, S - 24, S - 24);
  cache.set(key, c);
  return c;
}

/**
 * A square outline, for the tile under the pointer in 3D. A texture rather
 * than line geometry so it has a width the camera cannot thin to nothing.
 */
export function outlineArt(): HTMLCanvasElement {
  const key = 'outline';
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas();
  const S = ART_SIZE;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 7;
  ctx.strokeRect(6, 6, S - 12, S - 12);
  cache.set(key, c);
  return c;
}
