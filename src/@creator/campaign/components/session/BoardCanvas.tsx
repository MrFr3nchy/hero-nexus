'use client';

/**
 * The sand table, drawn.
 *
 * One canvas, one floor: every tile, wall, stair, prop, light and token of
 * the floor in front, plus whatever the surface on top is doing to it — a
 * reach lit for a picked-up token, a marquee mid-drag, the fog the party
 * has not been shown, the floor below in dashes. Two surfaces share it:
 * the board on the screen, where a fight is played, and the workshop,
 * where the board is built. Neither draws a tile of its own, so a wall
 * looks the same wherever it is looked at.
 *
 * Canvas 2D, not SVG. A 60×60 board is 3,600 tiles and the DOM would hate
 * it. What it draws is what it is handed — the fog filter ran on the
 * server, and a player's document never held the tiles they may not see.
 */
import { useEffect, useState, type RefObject } from 'react';

import {
  distanceFeet,
  distanceSquares,
  wallIndex,
  type Tile,
} from '@/@creator/campaign/lib/battlemap';
import { litAt } from '@/@creator/campaign/lib/things';
import { floorArt, shade } from '@/@shared/battlemap/art';
import {
  inBounds,
  linkOtherEnd,
  MATERIALS,
  VOID,
  type BoardDoc,
  type LevelDoc,
  type Side,
} from '@/@shared/battlemap/types';
import type { BattleTokenRow } from '@/server/battlemap';
import type { EntryRow } from '@/server/session';
import { movementBudget } from '@/@creator/campaign/lib/turn';

/* --- drawing helpers --------------------------------------------------- */

export interface Palette {
  line: string;
  ink: string;
  inkMuted: string;
  gold: string;
  danger: string;
  success: string;
  warning: string;
  arcane: string;
  surface: string;
  dark: boolean;
}

export function readPalette(dark: boolean): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    line: v('--line', dark ? '#33291d' : '#e4dccb'),
    ink: v('--ink', dark ? '#ede7da' : '#2b2620'),
    inkMuted: v('--ink-muted', dark ? '#a89f8d' : '#6b6459'),
    gold: v('--gold', dark ? '#d9b061' : '#b4894a'),
    danger: v('--danger', dark ? '#d9756c' : '#a23b34'),
    success: v('--success', dark ? '#6bbf8a' : '#3f7d55'),
    warning: v('--warning', dark ? '#d6a253' : '#b07d33'),
    arcane: v('--arcane', dark ? '#a988cf' : '#6b4d8a'),
    surface: v('--surface', dark ? '#1e1a14' : '#ffffff'),
    dark,
  };
}

/** The HP ring colour, by the ratio rule `HeroCard` already uses. */
function hpTone(entry: EntryRow | undefined, p: Palette): string | null {
  if (!entry || entry.hpCurrent === null || !entry.hpMax) return null;
  const ratio = entry.hpCurrent / entry.hpMax;
  if (ratio > 0.5) return p.success;
  if (ratio > 0.25) return p.warning;
  return p.danger;
}

export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Which edge of a tile a pointer is nearest, if it is near one at all.
 * Within ~22% of the tile size from an edge counts; the middle is the tile.
 */
export function nearestEdge(fx: number, fy: number): Side | null {
  const m = 0.22;
  const d = { n: fy, s: 1 - fy, w: fx, e: 1 - fx };
  const [side, dist] = (Object.entries(d) as [Side, number][]).sort(
    (a, b) => a[1] - b[1]
  )[0];
  return dist < m ? side : null;
}

/** The tile — and the edge, if near one — under a pointer event. */
export function tileAt(
  canvas: HTMLCanvasElement,
  terrain: { w: number; h: number },
  ev: { clientX: number; clientY: number }
): { x: number; y: number; side: Side | null } | null {
  const rect = canvas.getBoundingClientRect();
  const size = rect.width / terrain.w;
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;
  const x = Math.floor(px / size);
  const y = Math.floor(py / size);
  if (x < 0 || y < 0 || x >= terrain.w || y >= terrain.h) return null;
  const fx = px / size - x;
  const fy = py / size - y;
  return { x, y, side: nearestEdge(fx, fy) };
}

export interface BoardCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
  /** The floor in front. */
  terrain: LevelDoc;
  /** The whole board, for the stairs and the floor below. */
  doc: BoardDoc | null;
  /** The tokens on this floor. */
  here: BattleTokenRow[];
  /** Every token on the board, for the tags at the top of the stairs. */
  allTokens: BattleTokenRow[];
  entriesById: Map<string, EntryRow>;
  currentEntryIds: Set<string>;
  /** This floor's revealed tiles, for the staff hatch; null draws no fog. */
  revealed: readonly number[] | null;
  isStaff: boolean;
  dark: boolean;
  /** Draw nothing: the canvas is hidden behind another view. */
  hidden?: boolean;
  /** Pixels a tile, when the caller sets the scale; else fitted to width. */
  zoom?: number | null;
  fitHeight?: number;
  onion: boolean;
  selectedLink: string | null;
  litArea: { tiles: Iterable<number>; origin: Tile } | null;
  /** Tiles a fog stroke has gathered and not yet sent. */
  pending: ReadonlySet<number> | null;
  reach: ReadonlyMap<number, number> | null;
  jumps: { landings: number[] } | null;
  faces: Map<string, HTMLImageElement>;
  imageUrlFor: (imageId: string) => string;
  faceFor: (
    entry: EntryRow | undefined,
    token?: { imageUrl: string | null }
  ) => HTMLImageElement | null;
  selectedIds: readonly string[];
  selected: string | null;
  hover: { x: number; y: number; side: Side | null } | null;
  /** 'edge' for an edge tool, a brush radius in tiles, or null for none. */
  hoverShape: 'edge' | number | null;
  marquee: { from: Tile; to: Tile } | null;
  ruler: { from: Tile; to: Tile | null; pinned: boolean } | null;
  diagonals: '5-5-5' | '5-10-5';
  /** Drawn last, on top of everything. */
  extras?: (ctx: CanvasRenderingContext2D, size: number, p: Palette) => void;
  /** A key that changes when `pending` or `extras` did, so the canvas redraws. */
  tick?: number;
  className?: string;
  onPointerDown?: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerMove?: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerUp?: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLCanvasElement>;
}

export function BoardCanvas({
  canvasRef,
  wrapRef,
  terrain,
  doc,
  here,
  allTokens,
  entriesById,
  currentEntryIds,
  revealed,
  isStaff,
  dark,
  hidden = false,
  zoom = null,
  fitHeight,
  onion,
  selectedLink,
  litArea,
  pending,
  reach,
  jumps,
  faces,
  imageUrlFor,
  faceFor,
  selectedIds,
  selected,
  hover,
  hoverShape,
  marquee,
  ruler,
  diagonals,
  extras,
  tick = 0,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: BoardCanvasProps) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    // Hidden behind the 3D view the wrapper has no width, and a zero-size
    // tile makes every radius below negative — `arc` throws on that and the
    // whole page went down with it. Found in a browser, not by a typecheck.
    if (hidden) return;
    const p = readPalette(dark);
    const width = wrap.clientWidth;
    let size = zoom ?? Math.floor(width / terrain.w);
    if (fitHeight && !zoom) {
      // Whatever sits above the canvas inside the region — the title bar, the
      // tools — is measured rather than guessed, so a DM's two tool rows and
      // a player's none both leave the board exactly filling what is left.
      const region = wrap.closest('[data-board-region]');
      const above = region
        ? wrap.getBoundingClientRect().top - region.getBoundingClientRect().top
        : 0;
      const room = fitHeight - above - 48;
      size = Math.max(2, Math.min(size, Math.floor(room / terrain.h)));
    }
    // Below this a token's rim is wider than its face and `arc` throws on
    // the negative radius, taking the page down — a phone held sideways
    // with a region measured before it had a height found it. Draw nothing
    // and wait for the next measurement rather than draw a crash.
    if (size < 6) return;
    const W = size * terrain.w;
    const H = size * terrain.h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Tiles: the same drawn surfaces the 3D view wraps onto its boxes —
    // flagstones, planks, grass — so the board is a floor and not a swatch
    // chart. A little seeded variation per tile keeps a room from reading as
    // wallpaper. Void is absent, not dark: the fog filter has already
    // removed anything a player may not see, and drawing "unknown" as a
    // shade would leak the shape of a room the server declined to describe.
    const elevationAt = (x: number, y: number): number | null => {
      if (!inBounds(terrain, x, y)) return null;
      const i = y * terrain.w + x;
      return terrain.material[i] === VOID ? null : terrain.elevation[i];
    };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (let y = 0; y < terrain.h; y++) {
      for (let x = 0; x < terrain.w; x++) {
        const i = y * terrain.w + x;
        const m = MATERIALS[terrain.material[i]] ?? MATERIALS[VOID];
        const px = x * size;
        const py = y * size;
        if (terrain.material[i] === VOID) continue;
        const art = floorArt(m.key, dark);
        if (art) ctx.drawImage(art, px, py, size, size);
        else {
          ctx.fillStyle = dark ? m.swatchDark : m.swatch;
          ctx.fillRect(px, py, size, size);
        }
        const v = ((i * 2654435761) % 1000) / 1000;
        ctx.fillStyle = v < 0.5 ? '#000000' : '#ffffff';
        ctx.globalAlpha = Math.abs(v - 0.5) * 0.14;
        ctx.fillRect(px, py, size, size);
        ctx.globalAlpha = 1;

        // Higher ground is lit, lower ground is in shadow — a wash by
        // height, so a stair of ledges reads as a stair.
        const e = terrain.elevation[i];
        if (e !== 0) {
          ctx.fillStyle = e > 0 ? '#ffffff' : '#000000';
          ctx.globalAlpha = Math.min(0.2, Math.abs(e) / 100);
          ctx.fillRect(px, py, size, size);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Grid. Faint: the tiles' own edges already carry most of it.
    ctx.strokeStyle = p.line;
    ctx.globalAlpha = dark ? 0.55 : 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= terrain.w; x++) {
      ctx.moveTo(x * size + 0.5, 0);
      ctx.lineTo(x * size + 0.5, H);
    }
    for (let y = 0; y <= terrain.h; y++) {
      ctx.moveTo(0, y * size + 0.5);
      ctx.lineTo(W, y * size + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Room names (the workshop), small caps across the room, quiet: the
    // hall knows it is the hall without a sign at the door.
    if (terrain.rooms && size >= 10) {
      ctx.fillStyle = p.ink;
      ctx.globalAlpha = 0.55;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const r of terrain.rooms) {
        const px = Math.max(
          8,
          Math.min(
            size * 0.42,
            (r.w * size - 8) / Math.max(4, r.name.length * 0.62)
          )
        );
        ctx.font = `600 ${px}px Cinzel, Georgia, serif`;
        ctx.fillText(
          r.name.toUpperCase(),
          (r.x + r.w / 2) * size,
          (r.y + r.h / 2) * size
        );
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // The floor below, ghosted (floors): the outline of its rooms and its
    // walls in dashes, so a stairwell is cut where the stair comes up and a
    // bedroom sits over a hall rather than over the garden. Staff only —
    // a player has not necessarily seen the floor below.
    const belowIdx = doc ? doc.levels.findIndex(l => l.id === terrain.id) : -1;
    const below =
      isStaff && onion && doc && belowIdx > 0 ? doc.levels[belowIdx - 1] : null;
    if (below) {
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.globalAlpha = dark ? 0.35 : 0.3;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const floorBelow = (x: number, y: number) =>
        inBounds(below, x, y) && below.material[y * below.w + x] !== VOID;
      for (let y = 0; y < below.h; y++) {
        for (let x = 0; x < below.w; x++) {
          if (!floorBelow(x, y)) continue;
          const px = x * size;
          const py = y * size;
          if (!floorBelow(x, y - 1)) {
            ctx.moveTo(px, py);
            ctx.lineTo(px + size, py);
          }
          if (!floorBelow(x, y + 1)) {
            ctx.moveTo(px, py + size);
            ctx.lineTo(px + size, py + size);
          }
          if (!floorBelow(x - 1, y)) {
            ctx.moveTo(px, py);
            ctx.lineTo(px, py + size);
          }
          if (!floorBelow(x + 1, y)) {
            ctx.moveTo(px + size, py);
            ctx.lineTo(px + size, py + size);
          }
        }
      }
      for (const w of below.walls) {
        const x0 = w.x * size;
        const y0 = w.y * size;
        switch (w.side) {
          case 'n':
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + size, y0);
            break;
          case 's':
            ctx.moveTo(x0, y0 + size);
            ctx.lineTo(x0 + size, y0 + size);
            break;
          case 'w':
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0, y0 + size);
            break;
          case 'e':
            ctx.moveTo(x0 + size, y0);
            ctx.lineTo(x0 + size, y0 + size);
            break;
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // Ledges: where a tile stands higher than its neighbour, the lower side
    // gets a shadow along the shared edge and the higher a thin lit lip. A
    // drop reads as a drop without a number on it — the number stays, small,
    // for anybody who wants the feet.
    for (let y = 0; y < terrain.h; y++) {
      for (let x = 0; x < terrain.w; x++) {
        const here = elevationAt(x, y);
        if (here === null) continue;
        const px = x * size;
        const py = y * size;
        const lip = Math.max(2, size * 0.1);
        const drop = Math.max(3, size * 0.22);
        const sides: [Side, number | null][] = [
          ['n', elevationAt(x, y - 1)],
          ['s', elevationAt(x, y + 1)],
          ['w', elevationAt(x - 1, y)],
          ['e', elevationAt(x + 1, y)],
        ];
        for (const [side, there] of sides) {
          if (there === null || there >= here) continue;
          // This tile is higher: shade the low tile's edge, light this one's.
          const depth = Math.min(1, (here - there) / 20);
          const x0 = side === 'e' ? px + size : px;
          const y0 = side === 's' ? py + size : py;
          const x1 =
            side === 'w' ? px - drop : side === 'e' ? px + size + drop : x0;
          const y1 =
            side === 'n' ? py - drop : side === 's' ? py + size + drop : y0;
          const shadow = ctx.createLinearGradient(x0, y0, x1, y1);
          shadow.addColorStop(0, `rgba(0,0,0,${0.22 + depth * 0.3})`);
          shadow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = shadow;
          switch (side) {
            case 'n':
              ctx.fillRect(px, py - drop, size, drop);
              break;
            case 's':
              ctx.fillRect(px, py + size, size, drop);
              break;
            case 'w':
              ctx.fillRect(px - drop, py, drop, size);
              break;
            case 'e':
              ctx.fillRect(px + size, py, drop, size);
              break;
          }
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          switch (side) {
            case 'n':
              ctx.fillRect(px, py, size, lip);
              break;
            case 's':
              ctx.fillRect(px, py + size - lip, size, lip);
              break;
            case 'w':
              ctx.fillRect(px, py, lip, size);
              break;
            case 'e':
              ctx.fillRect(px + size - lip, py, lip, size);
              break;
          }
        }
        if (here !== 0 && size >= 18) {
          ctx.fillStyle = p.ink;
          ctx.globalAlpha = 0.7;
          ctx.font = `600 ${Math.max(8, size * 0.24)}px ui-sans-serif, system-ui`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(
            `${here > 0 ? '+' : ''}${here}`,
            px + size - 3,
            py + size - 2
          );
          ctx.globalAlpha = 1;
        }
      }
    }

    // Fog, for staff: what the party has *not* been shown is hatched over,
    // and the stroke in progress is lit in gold. The first cut washed the
    // revealed tiles gold instead, and since most of a board is revealed
    // most of the time, the DM's whole room went mustard. The hidden part
    // is the smaller set and the one the DM is actually deciding about.
    if (isStaff) {
      const shown = new Set(revealed ?? []);
      ctx.save();
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < terrain.w * terrain.h; i++) {
        if (terrain.material[i] === VOID || shown.has(i)) continue;
        ctx.rect(
          (i % terrain.w) * size,
          Math.floor(i / terrain.w) * size,
          size,
          size
        );
        any = true;
      }
      if (any) {
        ctx.clip();
        ctx.fillStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(43,38,32,0.28)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(43,38,32,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const step = Math.max(6, size * 0.3);
        for (let d = -H; d < W; d += step) {
          ctx.moveTo(d, 0);
          ctx.lineTo(d + H, H);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // The area a spell would cover, in the arcane hue.
    if (litArea) {
      ctx.fillStyle = p.arcane;
      ctx.globalAlpha = 0.35;
      for (const i of litArea.tiles) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.fillRect(x * size, y * size, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.arcane;
      ctx.lineWidth = 2;
      const ox = (litArea.origin.x + 0.5) * size;
      const oy = (litArea.origin.y + 0.5) * size;
      ctx.beginPath();
      ctx.arc(ox, oy, size * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (isStaff && pending && pending.size > 0) {
      ctx.fillStyle = p.gold;
      ctx.globalAlpha = 0.32;
      for (const i of pending) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.fillRect(x * size, y * size, size, size);
      }
      ctx.globalAlpha = 1;
    }

    // A dark board (08): what nobody lights sits under a cool grey, so the
    // party can tell "we have seen this" from "we can see this now". Torches
    // carried by tokens light their pool the way a brazier does.
    const torches = here
      .filter(t => t.lightFeet && t.lightFeet > 0)
      .map(t => ({ x: t.x, y: t.y, radiusFeet: t.lightFeet as number }));
    if (terrain.ambient === 'dark') {
      ctx.fillStyle = dark ? 'rgba(60,70,90,0.45)' : 'rgba(70,80,100,0.35)';
      for (let y = 0; y < terrain.h; y++) {
        for (let x = 0; x < terrain.w; x++) {
          const i = y * terrain.w + x;
          if (terrain.material[i] === VOID) continue;
          if (litAt(terrain, { x, y }, torches)) continue;
          ctx.fillRect(x * size, y * size, size, size);
        }
      }
    }
    for (const t of torches) {
      const cx = (t.x + 0.5) * size;
      const cy = (t.y + 0.5) * size;
      const r = (t.radiusFeet / 5) * size;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(
        0,
        dark ? 'rgba(255,196,110,0.4)' : 'rgba(217,160,70,0.3)'
      );
      g.addColorStop(1, 'rgba(217,176,97,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // Lights: a warm pool on the floor and a brazier standing in it.
    // Candlelight is the palette; lean into it.
    for (const l of terrain.lights) {
      const cx = (l.x + 0.5) * size;
      const cy = (l.y + 0.5) * size;
      const r = (l.radius / 5) * size;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(
        0,
        dark ? 'rgba(255,196,110,0.5)' : 'rgba(217,160,70,0.4)'
      );
      g.addColorStop(
        0.5,
        dark ? 'rgba(255,180,90,0.18)' : 'rgba(217,160,70,0.14)'
      );
      g.addColorStop(1, 'rgba(217,176,97,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      const bowl = Math.max(3, size * 0.16);
      ctx.fillStyle = dark ? '#2a2622' : '#3a3530';
      ctx.beginPath();
      ctx.arc(cx, cy, bowl, 0, Math.PI * 2);
      ctx.fill();
      const flame = ctx.createRadialGradient(cx, cy, 0, cx, cy, bowl * 0.8);
      flame.addColorStop(0, '#fff2c0');
      flame.addColorStop(0.5, '#ffb050');
      flame.addColorStop(1, 'rgba(230,100,30,0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.arc(cx, cy, bowl * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reach, for the selected token: a faint gold fill and an inset outline
    // per tile — the lit squares a game shows when a piece is picked up.
    // Nothing else on the board is a gold fill now that the fog is a hatch
    // over the hidden part, so the two cannot be mistaken for each other.
    if (reach) {
      const inset = Math.max(3, size * 0.14);
      for (const i of reach.keys()) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.fillStyle = p.gold;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(
          x * size + inset,
          y * size + inset,
          size - inset * 2,
          size - inset * 2
        );
      }
      ctx.setLineDash([]);
    }

    // Jump landings: a dashed ring on the far side of a gap, nothing
    // filled — a place you can get to, not a place you can walk to. Round,
    // where the reach is square, so a landing that is also in walking reach
    // still reads as a jump.
    if (jumps && jumps.landings.length > 0) {
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const i of jumps.landings) {
        const x = i % terrain.w;
        const y = Math.floor(i / terrain.w);
        ctx.beginPath();
        ctx.arc(
          (x + 0.5) * size,
          (y + 0.5) * size,
          size * 0.36,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Props: drawn, never typed.
    for (const pr of terrain.props) {
      const cx = (pr.x + 0.5) * size;
      const cy = (pr.y + 0.5) * size;
      const s = size * 0.3;
      if (pr.kind === 'image') {
        // The picture itself, fitted inside the tile, so the top-down board
        // shows the tree the DM stood up rather than a mark for it. A
        // dashed square while it loads.
        const img = pr.imageId ? faces.get(imageUrlFor(pr.imageId)) : null;
        const box = size * 0.9;
        if (img) {
          const scale = Math.min(
            box / img.naturalWidth,
            box / img.naturalHeight
          );
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
        } else {
          ctx.strokeStyle = p.inkMuted;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(cx - box / 2, cy - box / 2, box, box);
          ctx.setLineDash([]);
        }
        continue;
      }
      // Stone things in stone, wooden things in wood, a tree in leaf — the
      // colours the 3D view builds them from, with a shadow underneath.
      const stoneFill = dark ? '#5a5248' : '#a1968a';
      const woodFill = dark ? MATERIALS[4].swatchDark : MATERIALS[4].swatch;
      const leafFill = dark ? '#3f5a2e' : '#7ea35e';
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(cx + size * 0.04, cy + size * 0.06, s * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark ? '#1c1814' : '#3a3530';
      const sc = pr.scale ?? 1;
      const s2 = s * sc;
      ctx.fillStyle =
        pr.kind === 'tree' || pr.kind === 'pine' || pr.kind === 'bush'
          ? leafFill
          : pr.kind === 'mushroom'
            ? dark
              ? '#b5543f'
              : '#a23b34'
            : pr.kind === 'hearth'
              ? dark
                ? '#6b2f22'
                : '#b5543f'
              : pr.kind === 'bed'
                ? dark
                  ? '#4a3f5c'
                  : '#c9b8dc'
                : pr.kind === 'table' ||
                    pr.kind === 'chest' ||
                    pr.kind === 'barrel' ||
                    pr.kind === 'shelf'
                  ? woodFill
                  : stoneFill;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      switch (pr.kind) {
        case 'barrel':
        case 'pillar':
          ctx.arc(cx, cy, s, 0, Math.PI * 2);
          break;
        case 'tree':
          ctx.arc(cx, cy, s2 * 1.15, 0, Math.PI * 2);
          break;
        case 'pine':
          ctx.moveTo(cx, cy - s2 * 1.2);
          ctx.lineTo(cx + s2, cy + s2);
          ctx.lineTo(cx - s2, cy + s2);
          ctx.closePath();
          break;
        case 'bush':
          ctx.arc(cx, cy, s2 * 0.7, 0, Math.PI * 2);
          break;
        case 'boulder':
          ctx.moveTo(cx - s2, cy + s2 * 0.4);
          ctx.lineTo(cx - s2 * 0.5, cy - s2 * 0.7);
          ctx.lineTo(cx + s2 * 0.6, cy - s2 * 0.6);
          ctx.lineTo(cx + s2, cy + s2 * 0.5);
          ctx.closePath();
          break;
        case 'mushroom':
          ctx.arc(cx - s2 * 0.35, cy, s2 * 0.4, 0, Math.PI * 2);
          ctx.moveTo(cx + s2 * 0.6, cy + s2 * 0.2);
          ctx.arc(cx + s2 * 0.3, cy + s2 * 0.2, s2 * 0.3, 0, Math.PI * 2);
          break;
        case 'bed':
          ctx.rect(cx - s, cy - s, s * 2, s * 2);
          break;
        case 'shelf':
          ctx.rect(cx - s * 0.5, cy - s, s, s * 2);
          break;
        case 'hearth':
          ctx.rect(cx - s, cy - s * 0.6, s * 2, s * 1.2);
          break;
        case 'statue':
        case 'altar':
          ctx.moveTo(cx, cy - s);
          ctx.lineTo(cx + s, cy);
          ctx.lineTo(cx, cy + s);
          ctx.lineTo(cx - s, cy);
          ctx.closePath();
          break;
        case 'rubble':
          ctx.arc(cx - s * 0.5, cy + s * 0.3, s * 0.4, 0, Math.PI * 2);
          ctx.moveTo(cx + s * 0.6, cy - s * 0.2);
          ctx.arc(cx + s * 0.3, cy - s * 0.2, s * 0.3, 0, Math.PI * 2);
          break;
        default:
          ctx.rect(cx - s, cy - s * 0.7, s * 2, s * 1.4);
      }
      ctx.fill();
      ctx.stroke();
    }

    // Stairs and ladders (floors): treads across the footprint, a gold
    // edge, and a tag saying which way they go. They stand on both floors,
    // so the same drawing is on the floor above, tagged the other way. A
    // hidden stair is dashed, and only staff are drawing it at all.
    const stairsHere = doc
      ? doc.links.filter(l => l.from === terrain.id || l.to === terrain.id)
      : [];
    for (const l of stairsHere) {
      const x0 = l.x * size;
      const y0 = l.y * size;
      const w = l.w * size;
      const h = l.h * size;
      const up = l.from === terrain.id;
      const tall = l.h >= l.w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, w, h);
      ctx.clip();
      ctx.fillStyle = dark ? '#2a231a' : '#e9dfc9';
      ctx.fillRect(x0, y0, w, h);
      const treadFill = dark ? '#9c8763' : '#a8905e';
      const treadGap = Math.max(4, size * (l.kind === 'ladder' ? 0.45 : 0.3));
      ctx.fillStyle = treadFill;
      if (l.kind === 'ladder') {
        // Two rails and rungs between them.
        const rail = Math.max(2, size * 0.1);
        const inset = Math.max(3, size * 0.2);
        if (tall) {
          ctx.fillRect(x0 + inset, y0, rail, h);
          ctx.fillRect(x0 + w - inset - rail, y0, rail, h);
          for (let y = y0 + treadGap / 2; y < y0 + h; y += treadGap)
            ctx.fillRect(x0 + inset, y, w - inset * 2, rail);
        } else {
          ctx.fillRect(x0, y0 + inset, w, rail);
          ctx.fillRect(x0, y0 + h - inset - rail, w, rail);
          for (let x = x0 + treadGap / 2; x < x0 + w; x += treadGap)
            ctx.fillRect(x, y0 + inset, rail, h - inset * 2);
        }
      } else {
        const tread = Math.max(2, treadGap * 0.45);
        if (tall) {
          for (let y = y0; y < y0 + h; y += treadGap)
            ctx.fillRect(x0, y, w, tread);
        } else {
          for (let x = x0; x < x0 + w; x += treadGap)
            ctx.fillRect(x, y0, tread, h);
        }
      }
      ctx.restore();
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 2;
      ctx.setLineDash(l.hidden ? [4, 4] : []);
      ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
      ctx.setLineDash([]);
      if (l.id === selectedLink) {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6);
      }
      if (size >= 14) {
        const tag = up ? 'UP' : 'DOWN';
        ctx.font = `700 ${Math.max(8, size * 0.28)}px Inter, system-ui, sans-serif`;
        const tw = ctx.measureText(tag).width + 6;
        const th = Math.max(10, size * 0.4);
        ctx.fillStyle = p.gold;
        ctx.fillRect(x0 + 2, y0 + 2, tw, th);
        ctx.fillStyle = dark ? '#16130f' : '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, x0 + 5, y0 + 2 + th / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Walls on edges, drawn with a little depth: masonry as a dark band
    // with a lit coping, a door as its plank leaf — swung open into the
    // room, with the arc it swept — a window as stone with the arcane pane
    // between, a rail as posts and a line.
    const walls = wallIndex(terrain);
    const masonryInk = dark ? '#1c1814' : '#3a3530';
    const masonryLit = dark ? '#8a7d6b' : '#a1968a';
    const plank = dark ? MATERIALS[4].swatchDark : MATERIALS[4].swatch;
    for (const w of walls.values()) {
      const x0 = w.x * size;
      const y0 = w.y * size;
      let ax = x0,
        ay = y0,
        bx = x0,
        by = y0;
      switch (w.side) {
        case 'n':
          bx = x0 + size;
          break;
        case 's':
          ay = by = y0 + size;
          bx = x0 + size;
          break;
        case 'w':
          by = y0 + size;
          break;
        case 'e':
          ax = bx = x0 + size;
          by = y0 + size;
          break;
      }
      // The edge's own direction, and the way into the tile it belongs to.
      const dx = bx - ax;
      const dy = by - ay;
      const inX = w.side === 'w' ? 1 : w.side === 'e' ? -1 : 0;
      const inY = w.side === 'n' ? 1 : w.side === 's' ? -1 : 0;
      const thick = Math.max(3, size * 0.16);
      ctx.lineCap = 'butt';
      ctx.setLineDash([]);
      if (w.kind !== 'rail') {
        // The shadow a standing wall throws, so it is not a line on paper.
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = thick * 1.6;
        ctx.beginPath();
        ctx.moveTo(ax + size * 0.04, ay + size * 0.06);
        ctx.lineTo(bx + size * 0.04, by + size * 0.06);
        ctx.stroke();
      }
      switch (w.kind) {
        case 'solid':
          ctx.strokeStyle = masonryInk;
          ctx.lineWidth = thick;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.strokeStyle = masonryLit;
          ctx.lineWidth = Math.max(1, thick * 0.3);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          break;
        case 'door': {
          // Jambs at both ends, in stone.
          ctx.strokeStyle = masonryInk;
          ctx.lineWidth = thick;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax + dx * 0.12, ay + dy * 0.12);
          ctx.moveTo(bx - dx * 0.12, by - dy * 0.12);
          ctx.lineTo(bx, by);
          ctx.stroke();
          const hx = ax + dx * 0.12;
          const hy = ay + dy * 0.12;
          const len = Math.hypot(dx, dy) * 0.76;
          ctx.lineWidth = Math.max(3, size * 0.12);
          ctx.strokeStyle = shade(plank, dark ? 0.15 : -0.25);
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          if (w.open) {
            // Swung into its tile on the hinge, and the sweep it took.
            ctx.lineTo(hx + inX * len, hy + inY * len);
            ctx.stroke();
            ctx.strokeStyle = p.success;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            const start = Math.atan2(dy, dx);
            const end = Math.atan2(inY, inX);
            const ccw = (end - start + Math.PI * 3) % (Math.PI * 2) > Math.PI;
            ctx.arc(hx, hy, len, start, end, ccw);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.lineTo(bx - dx * 0.12, by - dy * 0.12);
            ctx.stroke();
            // The strapping.
            ctx.strokeStyle = dark ? '#1c1815' : '#2a2622';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (const f of [0.35, 0.65]) {
              const sx = hx + dx * 0.76 * f;
              const sy = hy + dy * 0.76 * f;
              ctx.moveTo(sx - inX * thick * 0.5, sy - inY * thick * 0.5);
              ctx.lineTo(sx + inX * thick * 0.5, sy + inY * thick * 0.5);
            }
            ctx.stroke();
          }
          break;
        }
        case 'window':
          ctx.strokeStyle = masonryInk;
          ctx.lineWidth = thick;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.strokeStyle = p.arcane;
          ctx.lineWidth = Math.max(2, thick * 0.45);
          ctx.beginPath();
          ctx.moveTo(ax + dx * 0.15, ay + dy * 0.15);
          ctx.lineTo(bx - dx * 0.15, by - dy * 0.15);
          ctx.stroke();
          break;
        case 'rail':
          ctx.strokeStyle = p.inkMuted;
          ctx.lineWidth = Math.max(1.5, size * 0.06);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.fillStyle = p.inkMuted;
          for (const f of [0.08, 0.5, 0.92]) {
            ctx.beginPath();
            ctx.arc(
              ax + dx * f,
              ay + dy * f,
              Math.max(1.5, size * 0.06),
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
          break;
      }
    }
    ctx.setLineDash([]);
    ctx.lineCap = 'round';

    // Tokens: the same piece the 3D view stands up, seen from above. A soft
    // ring of the side's colour on the floor, a pewter base with the side's
    // colour as its rim, the face inside, and the hit points as an arc round
    // the outside — not a counter painted in the side's colour edge to edge.
    for (const t of here) {
      const entry = t.entryId ? entriesById.get(t.entryId) : undefined;
      const label = entry?.label ?? t.label ?? '';
      const cx = (t.x + t.footprint / 2) * size;
      const cy = (t.y + t.footprint / 2) * size;
      const r = Math.max(
        1,
        (size * t.footprint) / 2 - Math.max(4, size * 0.16)
      );
      const faint = t.visibility === 'dm';
      const sideColour =
        entry?.side === 'foe'
          ? p.danger
          : entry?.side === 'party'
            ? p.gold
            : p.inkMuted;

      // The halo on the floor.
      const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.5);
      halo.addColorStop(0, sideColour);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.globalAlpha = faint ? 0.2 : 0.45;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // The base: pewter, with a shadow under its edge.
      ctx.globalAlpha = faint ? 0.45 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(cx + size * 0.03, cy + size * 0.04, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark ? '#4c463e' : '#8a8173';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = sideColour;
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // HP as an arc, by the HeroCard rule: the tone says how it is going,
      // the arc's length says how much is left. For a foe the server has
      // nulled the numbers for a player, so there is no arc — as the tracker
      // shows a word rather than a number.
      const tone = hpTone(entry, p);
      if (tone && entry && entry.hpCurrent !== null && entry.hpMax) {
        const ratio = Math.max(0, Math.min(1, entry.hpCurrent / entry.hpMax));
        const ar = r + Math.max(2, size * 0.07);
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, ar, 0, Math.PI * 2);
        ctx.stroke();
        if (ratio > 0) {
          ctx.strokeStyle = tone;
          ctx.beginPath();
          ctx.arc(cx, cy, ar, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
          ctx.stroke();
        }
      }

      // The one animated thing: whose turn it is.
      if (entry && currentEntryIds.has(entry.id)) {
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.setLineDash([size * 0.12, size * 0.08]);
        ctx.beginPath();
        ctx.arc(cx, cy, r + Math.max(5, size * 0.18), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Selection. Every token in the group wears the ring; the last one
      // picked — the target — wears it in ink, the rest in gold.
      if (selectedIds.includes(t.id)) {
        ctx.strokeStyle = t.id === selected ? p.ink : p.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + Math.max(8, size * 0.26), 0, Math.PI * 2);
        ctx.stroke();
      }

      // The turn, as four pips under the selected token whose turn it is:
      // action, bonus, reaction, movement — filled when spent. The same
      // data the card's strip shows; drawn here so the board answers "has
      // it acted" on its own.
      if (t.id === selected && entry && currentEntryIds.has(entry.id)) {
        const pr = Math.max(2, size * 0.07);
        const gap = pr * 2.6;
        const py = cy + r + Math.max(8, size * 0.26) + pr * 2.2;
        const spent = [
          entry.turn.action,
          entry.turn.bonus,
          entry.turn.reaction,
          movementBudget(entry.turn, entry.speed) === 0,
        ];
        spent.forEach((on, i) => {
          const px = cx + (i - 1.5) * gap;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fillStyle = on ? p.gold : 'rgba(0,0,0,0.35)';
          ctx.fill();
          ctx.strokeStyle = p.gold;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      // The face, clipped inside the rim, or initials when there is none.
      const face = faceFor(entry, t);
      const inner = r - Math.max(2, size * 0.07);
      if (face) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, inner, 0, Math.PI * 2);
        ctx.clip();
        // Cover, not stretch: the shorter side fills the circle.
        const scale = Math.max(
          (inner * 2) / face.naturalWidth,
          (inner * 2) / face.naturalHeight
        );
        const dw = face.naturalWidth * scale;
        const dh = face.naturalHeight * scale;
        ctx.globalAlpha = faint ? 0.5 : 1;
        ctx.drawImage(face, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.globalAlpha = 1;
        ctx.restore();
      } else {
        ctx.fillStyle = '#ece3cf';
        ctx.globalAlpha = faint ? 0.6 : 1;
        ctx.font = `600 ${Math.max(9, inner * 0.85)}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials(label), cx, cy + 1);
        ctx.globalAlpha = 1;
      }

      // What a thing is: a lock on a locked one, a cross through a broken
      // one, and an open one drawn lighter — it no longer blocks its tile.
      if (t.state === 'locked') {
        const k = Math.max(4, size * 0.16);
        const lx = cx + r - k;
        const ly = cy - r;
        ctx.fillStyle = p.ink;
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = Math.max(1.5, k * 0.25);
        ctx.beginPath();
        ctx.arc(lx + k / 2, ly + k * 0.45, k * 0.3, Math.PI, 0);
        ctx.stroke();
        ctx.fillRect(lx, ly + k * 0.45, k, k * 0.75);
      } else if (t.state === 'broken') {
        ctx.strokeStyle = p.danger;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy - r * 0.7);
        ctx.lineTo(cx + r * 0.7, cy + r * 0.7);
        ctx.moveTo(cx + r * 0.7, cy - r * 0.7);
        ctx.lineTo(cx - r * 0.7, cy + r * 0.7);
        ctx.stroke();
      } else if (t.state === 'open') {
        ctx.strokeStyle = p.success;
        ctx.lineWidth = Math.max(1.5, size * 0.05);
        ctx.setLineDash([size * 0.1, size * 0.1]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Who is at the other end of the stairs (floors): a small tag beside
    // each, counting the heroes and foes on the floor it leads to — the
    // ones this reader may see, which for a player is the ones the party
    // has. The board answers "is anybody up there" without a tab switch.
    if (doc && size >= 12) {
      for (const l of stairsHere) {
        const otherId = linkOtherEnd(l, terrain.id);
        if (!otherId) continue;
        let heroes = 0;
        let foes = 0;
        for (const t of allTokens) {
          if (t.level !== otherId || !t.entryId) continue;
          const side = entriesById.get(t.entryId)?.side;
          if (side === 'party') heroes += 1;
          else if (side === 'foe') foes += 1;
        }
        if (heroes === 0 && foes === 0) continue;
        const bits: string[] = [];
        if (heroes) bits.push(`${heroes} ${heroes === 1 ? 'hero' : 'heroes'}`);
        if (foes) bits.push(`${foes} ${foes === 1 ? 'foe' : 'foes'}`);
        const up = l.from === terrain.id;
        const text = `${up ? '↑' : '↓'} ${bits.join(', ')} ${up ? 'upstairs' : 'below'}`;
        ctx.font = `600 ${Math.max(10, size * 0.34)}px Inter, system-ui, sans-serif`;
        const tw = ctx.measureText(text).width + 10;
        const th = Math.max(16, size * 0.5);
        const bx = Math.min(W - tw - 2, (l.x + l.w) * size + 4);
        const by = Math.max(2, l.y * size + 2);
        ctx.fillStyle = p.surface;
        ctx.globalAlpha = 0.94;
        ctx.fillRect(bx, by, tw, th);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.gold;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
        ctx.fillStyle = p.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + 5, by + th / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Hover: the edge a wall would land on, or the tiles a brush covers.
    if (hover && hoverShape) {
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 2;
      if (hoverShape === 'edge' && hover.side) {
        const x0 = hover.x * size;
        const y0 = hover.y * size;
        ctx.beginPath();
        switch (hover.side) {
          case 'n':
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + size, y0);
            break;
          case 's':
            ctx.moveTo(x0, y0 + size);
            ctx.lineTo(x0 + size, y0 + size);
            break;
          case 'w':
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0, y0 + size);
            break;
          case 'e':
            ctx.moveTo(x0 + size, y0);
            ctx.lineTo(x0 + size, y0 + size);
            break;
        }
        ctx.stroke();
      } else if (typeof hoverShape === 'number') {
        const r = hoverShape;
        ctx.strokeRect(
          (hover.x - r) * size + 1,
          (hover.y - r) * size + 1,
          size * (2 * r + 1) - 2,
          size * (2 * r + 1) - 2
        );
      }
    }

    // The rectangle being dragged: a dashed box over the tiles it will take.
    if (marquee) {
      const x0 = Math.min(marquee.from.x, marquee.to.x) * size;
      const y0 = Math.min(marquee.from.y, marquee.to.y) * size;
      const x1 = (Math.max(marquee.from.x, marquee.to.x) + 1) * size;
      const y1 = (Math.max(marquee.from.y, marquee.to.y) + 1) * size;
      ctx.fillStyle = p.gold;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
      ctx.setLineDash([]);
    }

    // The ruler: a line between two tile centres and the feet beside it.
    if (ruler && ruler.to) {
      const ax = (ruler.from.x + 0.5) * size;
      const ay = (ruler.from.y + 0.5) * size;
      const bx = (ruler.to.x + 0.5) * size;
      const by = (ruler.to.y + 0.5) * size;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.setLineDash(ruler.pinned ? [] : [6, 4]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y] of [
        [ax, ay],
        [bx, by],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(3, size * 0.1), 0, Math.PI * 2);
        ctx.fillStyle = p.ink;
        ctx.fill();
      }
      const feet = distanceFeet(ruler.from, ruler.to, diagonals);
      const squares = distanceSquares(ruler.from, ruler.to);
      const label = `${feet} ft · ${squares} sq`;
      ctx.font = `600 ${Math.max(11, size * 0.4)}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(label).width + 10;
      const th = Math.max(16, size * 0.55);
      const lx = Math.min(W - tw - 2, Math.max(2, (ax + bx) / 2 - tw / 2));
      const ly = Math.min(H - th - 2, Math.max(2, (ay + by) / 2 - th - 6));
      ctx.fillStyle = p.surface;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(lx, ly, tw, th);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx + 0.5, ly + 0.5, tw - 1, th - 1);
      ctx.fillStyle = p.ink;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 5, ly + th / 2);
      ctx.textBaseline = 'alphabetic';
    }

    // Whatever the surface on top wants drawn last: a stamp's ghost, a tag.
    extras?.(ctx, size, p);
  }, [
    canvasRef,
    wrapRef,
    terrain,
    doc,
    here,
    allTokens,
    entriesById,
    currentEntryIds,
    revealed,
    isStaff,
    dark,
    hidden,
    zoom,
    fitHeight,
    onion,
    selectedLink,
    litArea,
    pending,
    reach,
    jumps,
    faces,
    imageUrlFor,
    faceFor,
    selectedIds,
    selected,
    hover,
    hoverShape,
    marquee,
    ruler,
    diagonals,
    extras,
    tick,
  ]);

  // Redraw on resize: the canvas is sized off its container.
  const [, bump] = useState(0);
  useEffect(() => {
    const onResize = () => bump(n => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={
        className ??
        'block cursor-crosshair touch-none rounded-md border border-line bg-bg'
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
    />
  );
}
