'use client';

/**
 * The sand table, in three dimensions.
 *
 * A view, not an editor. The scene is a pure function of the `TerrainDoc` the
 * 2D board authors — it is rebuilt whole whenever the document changes, never
 * patched, because terrain changes in prep and not mid-fight and incremental
 * mesh updates are a class of bug this does not need. Tokens are rebuilt on
 * their own when they move, which is the one thing that changes during play.
 *
 * **Never imported directly.** `BattleMap3DLazy` loads it with `ssr: false`:
 * Three.js is ~600 KB and there is no WebGL in Node. If this ever lands in
 * the campaign page's initial bundle, every DM opening the quests tab pays
 * for it.
 *
 * Design language: the board is the artifact (rule 1). Its one animated
 * flourish is the active-turn ring (rule 4) and nothing else on the route
 * moves — no floating props, no bobbing water, no drifting fog. Colours are
 * read off the CSS custom properties at build so light and dark both work,
 * and the palette is parchment and candlelight: the terrain is muted, the
 * tokens are the only saturated things, and a warm point light sits on each
 * brazier.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  canStand,
  reachFor,
  type Occupant,
} from '@/@creator/campaign/lib/battlemap';
import { MATERIALS, VOID, type TerrainDoc } from '@/@shared/battlemap/types';
import { useReducedMotion } from '@/@shared/components/motion';
import type { BattleTokenRow } from '@/server/battlemap';
import type { EntryRow } from '@/server/session';

/** Feet per world unit. One tile is one unit is five feet. */
const FEET_PER_UNIT = 5;

/** The slab under every tile, so a floor at elevation 0 still has a side. */
const SLAB = 0.3;

/**
 * Quality tiers — one knob, because the things it scales have to move together.
 * The idea is `cartograph`'s; the numbers are this feature's.
 */
const QUALITY = {
  shadowMap: 2048,
  antialias: true,
  pixelRatioCap: 2,
} as const;

export interface Palette {
  bg: THREE.Color;
  ink: THREE.Color;
  gold: THREE.Color;
  danger: THREE.Color;
  success: THREE.Color;
  warning: THREE.Color;
  arcane: THREE.Color;
  inkMuted: THREE.Color;
  surface: THREE.Color;
}

function readPalette(dark: boolean): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  return {
    bg: v('--bg', dark ? '#16130f' : '#faf6ef'),
    ink: v('--ink', dark ? '#ede7da' : '#2b2620'),
    gold: v('--gold', dark ? '#d9b061' : '#b4894a'),
    danger: v('--danger', dark ? '#d9756c' : '#a23b34'),
    success: v('--success', dark ? '#6bbf8a' : '#3f7d55'),
    warning: v('--warning', dark ? '#d6a253' : '#b07d33'),
    arcane: v('--arcane', dark ? '#a988cf' : '#6b4d8a'),
    inkMuted: v('--ink-muted', dark ? '#a89f8d' : '#6b6459'),
    surface: v('--surface', dark ? '#1e1a14' : '#ffffff'),
  };
}

function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** A standee's card, in canvas pixels. Portrait, two by three. */
const STANDEE_W = 256;
const STANDEE_H = 384;

/**
 * A paper standee: the character's face, or two letters when there is none,
 * on a parchment card that stands upright on the token's base and turns to
 * face the camera.
 *
 * The-sand-table's phase 6. It replaced a circle floating above the base —
 * the same billboard, anchored at its foot and given the shape of the thing
 * a table already knows: a paper miniature in a slotted base. A portrait
 * with a transparent background reads as a cut-out; one without reads as a
 * card, which is still a thing somebody printed and stood up. Drawn once per
 * token into a small canvas. The parchment and the ink are fixed — paper is
 * paper in candlelight, and a card that took the dark palette's surface read
 * as a black slab — and only the border is the palette's gold.
 *
 * The deckle is a few pixels of torn edge along the top, drawn with a fixed
 * seed so the same standee tears the same way every build — a card that
 * changed its edge on every token move would be motion nobody asked for.
 */
function standeeSprite(
  text: string,
  ink: string,
  paper: string,
  border: string,
  face: HTMLImageElement | null
): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = STANDEE_W;
  c.height = STANDEE_H;
  const ctx = c.getContext('2d')!;
  const inset = 10;

  // The card, with a torn top edge.
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.moveTo(inset, inset + 6);
  let seed = 7;
  for (let x = inset; x <= STANDEE_W - inset; x += 12) {
    seed = (seed * 9301 + 49297) % 233280;
    ctx.lineTo(x, inset + (seed / 233280) * 8);
  }
  ctx.lineTo(STANDEE_W - inset, STANDEE_H - inset);
  ctx.lineTo(inset, STANDEE_H - inset);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  if (face && face.naturalWidth > 0) {
    // Cover the card, keeping the top of the picture: a portrait's face is
    // in its upper half and a cut-out's feet belong at the base.
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      inset + 4,
      inset + 12,
      STANDEE_W - 2 * (inset + 4),
      STANDEE_H - 2 * inset - 16
    );
    ctx.clip();
    const w = STANDEE_W - 2 * (inset + 4);
    const h = STANDEE_H - 2 * inset - 16;
    const scale = Math.max(w / face.naturalWidth, h / face.naturalHeight);
    const dw = face.naturalWidth * scale;
    const dh = face.naturalHeight * scale;
    ctx.drawImage(face, inset + 4 + (w - dw) / 2, inset + 12, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = ink;
    ctx.font = '600 120px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, STANDEE_W / 2, STANDEE_H / 2 + 8);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  // Anchored at the foot, so it stands on the base rather than hanging over it.
  sprite.center.set(0.5, 0);
  return sprite;
}

/* --- building the scene ------------------------------------------------ */

/**
 * Exported for verification. The scene is built apart from any DOM except the
 * label sprites, so the geometry — where a wall lands, how tall a ledge is —
 * can be asserted headlessly the way the rules in `lib/battlemap.ts` are.
 */
export function buildTerrain(
  doc: TerrainDoc,
  p: Palette,
  dark: boolean
): THREE.Group {
  const group = new THREE.Group();
  const unit = new THREE.BoxGeometry(1, 1, 1);

  // Floor: one instanced mesh per material, scaled in Y to the tile's height.
  // One draw call per material rather than per tile. Capacity is the tile
  // count per material, fixed at construction — the Three.js trap the handoff
  // names: you cannot push an instance onto an existing mesh.
  const byMaterial = new Map<number, number[]>();
  for (let i = 0; i < doc.w * doc.h; i++) {
    const m = doc.material[i];
    if (m === VOID) continue;
    if (!byMaterial.has(m)) byMaterial.set(m, []);
    byMaterial.get(m)!.push(i);
  }
  const tmp = new THREE.Object3D();
  for (const [m, tiles] of byMaterial) {
    const spec = MATERIALS[m];
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(dark ? spec.swatchDark : spec.swatch),
      roughness: spec.key === 'water' ? 0.25 : 0.95,
      metalness: 0,
      // Water and lava glow faintly rather than reflect; it reads better on a
      // parchment ground than a mirror does.
      emissive:
        spec.key === 'lava'
          ? new THREE.Color('#5a1e12')
          : spec.key === 'water'
            ? new THREE.Color(dark ? '#0f1a26' : '#1a2a3a')
            : new THREE.Color('#000000'),
      emissiveIntensity: 0.35,
    });
    const mesh = new THREE.InstancedMesh(unit, mat, tiles.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tiles.forEach((i, k) => {
      const x = i % doc.w;
      const z = Math.floor(i / doc.w);
      const top = doc.elevation[i] / FEET_PER_UNIT;
      const height = top + SLAB;
      tmp.position.set(x + 0.5, top - height / 2, z + 0.5);
      tmp.scale.set(0.995, height, 0.995);
      tmp.updateMatrix();
      mesh.setMatrixAt(k, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    // The raycast gives back an instance id; this is how it becomes a tile.
    // Against the floor instances and nothing else — not invisible planes per
    // elevation level, which the handoff warns you will fight forever.
    mesh.userData.tiles = tiles;
    mesh.userData.floor = true;
    group.add(mesh);
  }

  // Walls: one instanced mesh per kind, on edges. Half a tile from the tile
  // centre in the direction of `side`, turned for north/south vs east/west.
  const wallKinds = new Map<string, typeof doc.walls>();
  for (const w of doc.walls) {
    if (!wallKinds.has(w.kind)) wallKinds.set(w.kind, []);
    wallKinds.get(w.kind)!.push(w);
  }
  // A wall is masonry, not a line. `--ink` as a two-unit slab on parchment is
  // a black monolith — seen on the first light-mode render — so solid walls
  // and props are ink pulled halfway toward stone: muted, and still darker
  // than the floor in both palettes.
  const stoneSwatch = new THREE.Color(
    dark ? MATERIALS[1].swatchDark : MATERIALS[1].swatch
  );
  const masonry = p.ink.clone().lerp(stoneSwatch, dark ? 0.35 : 0.55);
  for (const [kind, walls] of wallKinds) {
    const colour =
      kind === 'door'
        ? p.gold
        : kind === 'window'
          ? p.arcane
          : kind === 'rail'
            ? p.inkMuted
            : masonry;
    const mat = new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.8,
      transparent: kind === 'window',
      opacity: kind === 'window' ? 0.45 : 1,
    });
    const mesh = new THREE.InstancedMesh(unit, mat, walls.length);
    mesh.castShadow = kind !== 'window';
    mesh.receiveShadow = true;
    walls.forEach((w, k) => {
      const i = w.y * doc.w + w.x;
      const here = doc.elevation[i] ?? 0;
      let ax = w.x,
        az = w.y;
      if (w.side === 'n') az -= 1;
      if (w.side === 's') az += 1;
      if (w.side === 'w') ax -= 1;
      if (w.side === 'e') ax += 1;
      const there =
        ax >= 0 && az >= 0 && ax < doc.w && az < doc.h
          ? (doc.elevation[az * doc.w + ax] ?? 0)
          : here;
      const base = Math.max(here, there) / FEET_PER_UNIT;
      // An open door is drawn as a stub, so the gap reads as a gap.
      const h = (w.kind === 'door' && w.open ? 1 : w.height) / FEET_PER_UNIT;
      const thickness = kind === 'rail' ? 0.06 : 0.12;

      const cx = w.x + 0.5 + (w.side === 'e' ? 0.5 : w.side === 'w' ? -0.5 : 0);
      const cz = w.y + 0.5 + (w.side === 's' ? 0.5 : w.side === 'n' ? -0.5 : 0);
      tmp.position.set(cx, base + h / 2, cz);
      if (w.side === 'n' || w.side === 's') {
        tmp.scale.set(1, h, thickness);
      } else {
        tmp.scale.set(thickness, h, 1);
      }
      tmp.updateMatrix();
      mesh.setMatrixAt(k, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Props: a few plain solids. Drawn, never typed, and muted like the floor.
  const propMat = new THREE.MeshStandardMaterial({
    color: masonry,
    roughness: 0.9,
  });
  const cylinder = new THREE.CylinderGeometry(0.3, 0.3, 1, 12);
  const cone = new THREE.ConeGeometry(0.4, 1, 8);
  const sphere = new THREE.SphereGeometry(0.25, 8, 6);
  for (const pr of doc.props) {
    const i = pr.y * doc.w + pr.x;
    const top = (doc.elevation[i] ?? 0) / FEET_PER_UNIT;
    let mesh: THREE.Mesh;
    let h = 0.6;
    switch (pr.kind) {
      case 'barrel':
        mesh = new THREE.Mesh(cylinder, propMat);
        h = 0.7;
        break;
      case 'pillar':
        mesh = new THREE.Mesh(cylinder, propMat);
        h = 2;
        break;
      case 'tree':
        mesh = new THREE.Mesh(cone, propMat);
        h = 1.6;
        break;
      case 'rubble':
        mesh = new THREE.Mesh(sphere, propMat);
        h = 0.5;
        break;
      case 'statue':
        mesh = new THREE.Mesh(unit, propMat);
        h = 1.4;
        mesh.scale.set(0.5, 1, 0.5);
        break;
      default:
        mesh = new THREE.Mesh(unit, propMat);
        mesh.scale.set(0.8, 1, 0.6);
    }
    mesh.scale.y = h;
    mesh.position.set(pr.x + 0.5, top + h / 2, pr.y + 0.5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Braziers. The warmth is the whole point of the palette.
  for (const l of doc.lights) {
    const i = l.y * doc.w + l.x;
    const top = (doc.elevation[i] ?? 0) / FEET_PER_UNIT;
    const light = new THREE.PointLight(
      p.gold,
      dark ? 6 : 3,
      l.radius / FEET_PER_UNIT,
      1.6
    );
    light.position.set(l.x + 0.5, top + 0.8, l.y + 0.5);
    group.add(light);
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: p.gold })
    );
    ember.position.copy(light.position);
    group.add(ember);
  }

  return group;
}

/** One token's drawing, positioned as a group so a move can lerp the group. */
export interface TokenPiece {
  group: THREE.Group;
  /** Where it should stand. The group lerps toward this. */
  at: THREE.Vector3;
}

interface TokenScene {
  /** By token id, so the next build can find the group that already exists. */
  pieces: Map<string, TokenPiece>;
  /** The active-turn ring, so the loop can turn it. Null when nobody's turn. */
  activeRing: THREE.Mesh | null;
}

export function buildTokens(
  doc: TerrainDoc,
  tokens: BattleTokenRow[],
  entries: Map<string, EntryRow>,
  currentEntryId: string | null,
  p: Palette,
  faceFor: (entry: EntryRow | undefined) => HTMLImageElement | null = () =>
    null,
  selectedId: string | null = null
): TokenScene {
  const pieces = new Map<string, TokenPiece>();
  let activeRing: THREE.Mesh | null = null;

  for (const t of tokens) {
    const group = new THREE.Group();
    const entry = t.entryId ? entries.get(t.entryId) : undefined;
    const label = entry?.label ?? t.label ?? '';
    const i = t.y * doc.w + t.x;
    const top =
      (doc.elevation[i] ?? 0) / FEET_PER_UNIT + t.altitude / FEET_PER_UNIT;
    const r = 0.38 * t.footprint;
    const at = new THREE.Vector3(
      t.x + t.footprint / 2,
      top,
      t.y + t.footprint / 2
    );
    group.position.copy(at);
    // Everything below is placed relative to the group, at the tile's top.
    const cx = 0;
    const cz = 0;
    const top0 = 0;

    const baseColour =
      entry?.side === 'foe'
        ? p.danger
        : entry?.side === 'party'
          ? p.gold
          : p.inkMuted;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.14, 24),
      new THREE.MeshStandardMaterial({
        color: baseColour,
        roughness: 0.6,
        transparent: t.visibility === 'dm',
        opacity: t.visibility === 'dm' ? 0.45 : 1,
      })
    );
    base.position.set(cx, top0 + 0.07, cz);
    base.castShadow = true;
    base.userData.tokenId = t.id;
    group.add(base);

    // HP ring, by the HeroCard rule. The server nulled a foe's numbers for a
    // player, so a player sees no ring on a foe — as the tracker shows a word.
    if (entry && entry.hpCurrent !== null && entry.hpMax) {
      const ratio = entry.hpCurrent / entry.hpMax;
      const tone =
        ratio > 0.5 ? p.success : ratio > 0.25 ? p.warning : p.danger;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.04, 0.035, 8, 40),
        new THREE.MeshBasicMaterial({ color: tone })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, top0 + 0.15, cz);
      group.add(ring);
    }

    // Whose turn it is. Gold, and the one thing on the board that moves.
    if (entry && entry.id === currentEntryId) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.16, 0.03, 8, 48),
        new THREE.MeshBasicMaterial({ color: p.gold })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, top0 + 0.16, cz);
      group.add(ring);
      activeRing = ring;
    }

    // The selected token — the target, the foe on the shelf. Ink, thin, and
    // outside the turn ring, so the two never read as one mark.
    if (t.id === selectedId) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.28, 0.025, 8, 48),
        new THREE.MeshBasicMaterial({ color: p.ink })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, top0 + 0.17, cz);
      group.add(ring);
    }

    // The standee. A medium creature's card is a tile and a quarter tall
    // and two thirds as wide; a large one's grows with its footprint. Dimmed
    // with the base for a token only the DM can see.
    // Paper is paper in candlelight: the card is parchment and the letters
    // ink in both palettes, and only the border takes the palette's gold. A
    // card that went black with the room read as a slab, not a miniature.
    const sprite = standeeSprite(
      initials(label),
      '#2b2620',
      '#ece3cf',
      `#${p.gold.getHexString()}`,
      faceFor(entry)
    );
    const tall = 1.25 * t.footprint;
    sprite.scale.set(tall * (STANDEE_W / STANDEE_H), tall, 1);
    sprite.position.set(cx, top0 + 0.14, cz);
    if (t.visibility === 'dm') {
      sprite.material.transparent = true;
      sprite.material.opacity = 0.55;
    }
    sprite.userData.tokenId = t.id;
    group.add(sprite);

    pieces.set(t.id, { group, at });
  }

  return { pieces, activeRing };
}

/* --- the component ----------------------------------------------------- */

export interface BattleMap3DProps {
  terrain: TerrainDoc;
  tokens: BattleTokenRow[];
  entries: EntryRow[];
  currentEntryId: string | null;
  /** Portrait URL by character id, off `LiveState`. */
  portraits: Record<string, string>;
  /** The ones that have loaded, from the cache the 2D board shares. */
  faces: Map<string, HTMLImageElement>;
  dark: boolean;
  /**
   * Drop a token on a tile. Resolves true if the server kept it; false snaps
   * it back. Sent **on drop, never during the drag** — a 60fps drag over the
   * wire is sixty writes a second per player.
   */
  onMove?: (tokenId: string, to: { x: number; y: number }) => Promise<boolean>;
  /** Feet of movement for a token, off the sheet or the default. */
  speedOf?: (token: BattleTokenRow) => number;
  /**
   * A token was tapped. The board publishes it the same way the 2D view
   * does, so the shelf's attacks and stat block follow a tap here too — any
   * token, not only one the reader may move, because aiming at a foe is the
   * commonest reason to tap one.
   */
  onSelect?: (tokenId: string) => void;
  /** The token the reader has selected, drawn with a ring of its own. */
  selectedId?: string | null;
  /**
   * Fill whatever height is left in the nearest `[data-board-region]` rather
   * than sizing off the width. Set by the screen, where the board is the main
   * region and a canvas at 62% of its width floated in the top half of it.
   */
  fill?: boolean;
}

export default function BattleMap3D({
  terrain,
  tokens,
  entries,
  currentEntryId,
  portraits,
  faces,
  dark,
  onMove,
  speedOf,
  onSelect,
  selectedId = null,
  fill = false,
}: BattleMap3DProps) {
  const mount = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Read by the pointer handlers without re-binding them on every change.
  const latest = useRef({
    terrain,
    tokens,
    entries,
    onMove,
    speedOf,
    onSelect,
  });
  latest.current = { terrain, tokens, entries, onMove, speedOf, onSelect };

  // Long-lived pieces, created once per mount.
  const world = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    terrainGroup: THREE.Group | null;
    pieces: Map<string, TokenPiece>;
    /** Tokens on their way somewhere: ~250ms ease-out, per the handoff. */
    moving: Map<string, { from: THREE.Vector3; to: THREE.Vector3; t: number }>;
    activeRing: THREE.Mesh | null;
    sun: THREE.DirectionalLight;
    frame: number;
    lerp: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null;
    /** A token in hand. */
    drag: {
      tokenId: string;
      piece: TokenPiece;
      from: THREE.Vector3;
      reach: Map<number, number>;
      hover: { x: number; y: number } | null;
    } | null;
    /** The lit tiles under a drag. */
    ghost: THREE.Group | null;
  } | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;

    const p = readPalette(dark);
    const renderer = new THREE.WebGLRenderer({
      antialias: QUALITY.antialias,
      alpha: false,
    });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, QUALITY.pixelRatioCap)
    );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = dark ? 1.15 : 1.1;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // By the flag rather than the CSS variable: on a theme toggle
    // `resolvedTheme` flips a beat before the class lands on <html>, and a
    // palette read in that beat is the old one. The two grounds are the
    // design language's own tokens, which do not move.
    scene.background = new THREE.Color(dark ? '#16130f' : '#faf6ef');

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    const cx = terrain.w / 2;
    const cz = terrain.h / 2;
    const span = Math.max(terrain.w, terrain.h);
    camera.position.set(cx + span * 0.35, span * 0.9, cz + span * 0.9);
    /*
     * Where the camera starts is decided by the frame, not by the board's
     * span: the same direction as above, at whatever distance puts the whole
     * board in view for this canvas's aspect — a canvas filling a tall region
     * is a different shape from one at 62% of its width, and a fixed distance
     * cropped the board in one and left it small in the other. Done once, on
     * the first layout; after that the orbit is the reader's.
     */
    const bearing = new THREE.Vector3(0.35, 0.9, 0.9).normalize();
    const radius = Math.hypot(terrain.w, terrain.h) / 2 + 0.5;
    let framed = false;
    const frame = () => {
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = radius / Math.sin(Math.min(vfov, hfov) / 2);
      camera.position
        .copy(bearing)
        .multiplyScalar(dist)
        .add(new THREE.Vector3(cx, 0, cz));
      // A narrow canvas can want more distance than the orbit's ceiling
      // allows; the ceiling gives way rather than the framing.
      controls.maxDistance = Math.max(controls.maxDistance, dist * 1.5);
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz);
    // Never under the floor, never quite flat: 15°–80° from vertical, as the
    // handoff sets it. Straight down is reached by the hotkey, which lerps
    // past the orbit's own floor.
    controls.minPolarAngle = THREE.MathUtils.degToRad(5);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
    controls.minDistance = 3;
    controls.maxDistance = span * 3;
    controls.enableDamping = !reduce;
    controls.dampingFactor = 0.08;
    controls.update();

    // Lighting: one warm key that casts the only shadow, one cool fill, and
    // a faint sky so the undersides of ledges are not black.
    // Steep, so a ten-foot wall throws a short shadow rather than one that
    // swallows the room beside it — seen on the first render, when the east
    // room read as unlit. Brighter in the dark palette than the number looks:
    // the floor there is nearly black and needs more light to read at all.
    const sun = new THREE.DirectionalLight(p.gold, dark ? 2.6 : 2.4);
    sun.position.set(cx - span * 0.25, span * 1.8, cz - span * 0.15);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = span * 4;
    const ortho = sun.shadow.camera as THREE.OrthographicCamera;
    ortho.left = -span;
    ortho.right = span;
    ortho.top = span;
    ortho.bottom = -span;
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(p.surface, p.ink, dark ? 0.9 : 0.5));
    scene.add(
      new THREE.AmbientLight(new THREE.Color('#8aa4bd'), dark ? 0.55 : 0.3)
    );

    world.current = {
      renderer,
      scene,
      camera,
      controls,
      terrainGroup: null,
      pieces: new Map(),
      moving: new Map(),
      activeRing: null,
      sun,
      frame: 0,
      lerp: null,
      drag: null,
      ghost: null,
    };

    // Whatever sits above the canvas inside the region is measured rather
    // than guessed — the same rule the 2D board applies to `fitHeight`.
    const region = fill ? el.closest('[data-board-region]') : null;
    const resize = () => {
      const w = el.clientWidth;
      let h = Math.max(240, Math.round(w * 0.62));
      if (region) {
        const above =
          el.getBoundingClientRect().top - region.getBoundingClientRect().top;
        // The status line and the scrawl under the canvas keep their room.
        h = Math.max(240, region.clientHeight - above - 72);
      }
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!framed) {
        framed = true;
        frame();
        controls.update();
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    if (region) ro.observe(region);

    // "t" for the top-down view: the 2D board rendered in 3D, which is what
    // people actually fight in. The lerp is the continuity that sells the
    // feature; under reduced motion it is a cut.
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 't' && ev.key !== 'T') return;
      const w = world.current;
      if (!w) return;
      const to = new THREE.Vector3(cx, span * 1.4, cz + 0.001);
      if (reduce) {
        camera.position.copy(to);
        controls.update();
        return;
      }
      w.lerp = { from: camera.position.clone(), to, t: 0 };
    };
    renderer.domElement.tabIndex = 0;
    renderer.domElement.addEventListener('keydown', onKey);

    /*
     * Picking up and putting down.
     *
     * A raycast against the floor instances gives an instance id, which the
     * floor mesh turns into a tile. A raycast against token bases gives a
     * token. Pointer-down on a token you may move lifts it and lights every
     * tile it can reach, by the same rules the 2D board uses; pointer-move
     * carries it over the tile under the pointer; pointer-up puts it down —
     * and only then is anything sent. Orbit is suspended while something is
     * in hand, or every drag would also spin the room.
     */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pointerTo = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1
      );
      ray.setFromCamera(ndc, camera);
    };
    const floorTileUnder = (
      ev: PointerEvent
    ): { x: number; y: number } | null => {
      const w = world.current;
      if (!w?.terrainGroup) return null;
      pointerTo(ev);
      const floors = w.terrainGroup.children.filter(c => c.userData.floor);
      const hit = ray.intersectObjects(floors, false)[0];
      if (!hit || hit.instanceId === undefined) return null;
      const tiles = hit.object.userData.tiles as number[];
      const i = tiles[hit.instanceId];
      const doc = latest.current.terrain;
      return { x: i % doc.w, y: Math.floor(i / doc.w) };
    };
    const tokenUnder = (ev: PointerEvent): string | null => {
      const w = world.current;
      if (!w) return null;
      pointerTo(ev);
      const bodies: THREE.Object3D[] = [];
      for (const piece of w.pieces.values())
        bodies.push(...piece.group.children);
      const hit = ray.intersectObjects(bodies, false)[0];
      return (hit?.object.userData.tokenId as string | undefined) ?? null;
    };

    const lightGhost = (reach: Map<number, number>) => {
      const w = world.current;
      if (!w) return;
      const doc = latest.current.terrain;
      const g = new THREE.Group();
      const geo = new THREE.PlaneGeometry(0.86, 0.86);
      const mat = new THREE.MeshBasicMaterial({
        color: p.gold,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      for (const i of reach.keys()) {
        const x = i % doc.w;
        const z = Math.floor(i / doc.w);
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(
          x + 0.5,
          doc.elevation[i] / FEET_PER_UNIT + 0.02,
          z + 0.5
        );
        g.add(m);
      }
      w.ghost = g;
      scene.add(g);
    };
    const darkenGhost = () => {
      const w = world.current;
      if (!w?.ghost) return;
      scene.remove(w.ghost);
      w.ghost.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      w.ghost = null;
    };

    const onDown = (ev: PointerEvent) => {
      const w = world.current;
      if (!w || ev.button !== 0) return;
      const id = tokenUnder(ev);
      if (!id) return;
      latest.current.onSelect?.(id);
      const token = latest.current.tokens.find(t => t.id === id);
      const piece = w.pieces.get(id);
      if (!token || !piece || !token.mine || !latest.current.onMove) return;

      // The same reach the 2D board draws — one helper, so the two views
      // cannot disagree about where a token may go.
      const doc = latest.current.terrain;
      const sideOf = (t: BattleTokenRow) =>
        t.entryId
          ? (latest.current.entries.find(e => e.id === t.entryId)?.side ?? null)
          : null;
      const asReach = (t: BattleTokenRow) => ({
        id: t.id,
        x: t.x,
        y: t.y,
        footprint: t.footprint,
        side: sideOf(t),
      });
      const reach = reachFor(
        doc,
        asReach(token),
        latest.current.tokens.map(asReach),
        latest.current.speedOf?.(token) ?? 30
      );
      w.drag = {
        tokenId: id,
        piece,
        from: piece.at.clone(),
        reach,
        hover: null,
      };
      w.moving.delete(id);
      piece.group.position.y = piece.at.y + 0.35;
      lightGhost(reach);
      controls.enabled = false;
      renderer.domElement.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    };
    const onMovePointer = (ev: PointerEvent) => {
      const w = world.current;
      if (!w?.drag) return;
      const tile = floorTileUnder(ev);
      w.drag.hover = tile;
      const doc = latest.current.terrain;
      const token = latest.current.tokens.find(t => t.id === w.drag!.tokenId);
      if (tile && token) {
        const top = doc.elevation[tile.y * doc.w + tile.x] / FEET_PER_UNIT;
        w.drag.piece.group.position.set(
          tile.x + token.footprint / 2,
          top + 0.35,
          tile.y + token.footprint / 2
        );
      }
    };
    const onUp = async (ev: PointerEvent) => {
      const w = world.current;
      if (!w?.drag) return;
      const d = w.drag;
      w.drag = null;
      darkenGhost();
      controls.enabled = true;
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // Already released.
      }

      const doc = latest.current.terrain;
      const token = latest.current.tokens.find(t => t.id === d.tokenId);
      const snapBack = () => d.piece.group.position.copy(d.from);
      if (!token || !d.hover) return snapBack();
      const to = d.hover;
      if (to.x === token.x && to.y === token.y) return snapBack();

      const me: Occupant = { x: to.x, y: to.y, footprint: token.footprint };
      const others = latest.current.tokens.filter(t => t.id !== d.tokenId);
      if (!canStand(doc, me, others)) return snapBack();

      // Optimistic: set it down where it was dropped, then ask. A refusal
      // snaps it back; an acceptance is confirmed by the next state read.
      const top = doc.elevation[to.y * doc.w + to.x] / FEET_PER_UNIT;
      d.piece.at.set(
        to.x + token.footprint / 2,
        top,
        to.y + token.footprint / 2
      );
      d.piece.group.position.copy(d.piece.at);
      const ok = await latest.current.onMove?.(d.tokenId, to);
      if (!ok) {
        d.piece.at.copy(d.from);
        snapBack();
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMovePointer);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);

    const clock = new THREE.Clock();
    const loop = () => {
      const w = world.current;
      if (!w) return;
      w.frame = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      if (w.lerp) {
        w.lerp.t = Math.min(1, w.lerp.t + dt * 1.8);
        const e = 1 - Math.pow(1 - w.lerp.t, 3);
        camera.position.lerpVectors(w.lerp.from, w.lerp.to, e);
        if (w.lerp.t >= 1) w.lerp = null;
      }
      if (w.activeRing && !reduce) w.activeRing.rotation.z += dt * 0.6;
      // Movement is interpolated, not teleported — for every viewer, not only
      // the one who moved it. Eight lines, and it feels like a different
      // product. Under reduced motion `moving` is never filled.
      for (const [id, m] of w.moving) {
        m.t = Math.min(1, m.t + dt * 4);
        const e = 1 - Math.pow(1 - m.t, 3);
        w.pieces.get(id)?.group.position.lerpVectors(m.from, m.to, e);
        if (m.t >= 1) w.moving.delete(id);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      const w = world.current;
      if (w) cancelAnimationFrame(w.frame);
      ro.disconnect();
      renderer.domElement.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMovePointer);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      controls.dispose();
      scene.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
      world.current = null;
    };
    // The scene is set up once per mount and per theme. Terrain and tokens are
    // rebuilt by the effects below rather than by tearing all of this down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, reduce]);

  // Terrain: rebuilt whole on change.
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    if (w.terrainGroup) {
      w.scene.remove(w.terrainGroup);
      w.terrainGroup.traverse(obj => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose();
      });
    }
    const p = readPalette(dark);
    w.terrainGroup = buildTerrain(terrain, p, dark);
    w.scene.add(w.terrainGroup);
  }, [terrain, dark]);

  // Tokens: rebuilt on their own, because they are what moves during a fight.
  // A token that already stood somewhere keeps its group's position as the
  // start of a lerp to where it now belongs; a new one appears in place.
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const previous = new Map<string, THREE.Vector3>();
    for (const [id, piece] of w.pieces) {
      previous.set(id, piece.group.position.clone());
      w.scene.remove(piece.group);
      piece.group.traverse(obj => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        if (mat && 'map' in mat) (mat as THREE.SpriteMaterial).map?.dispose();
        mat?.dispose();
      });
    }
    w.moving.clear();
    const p = readPalette(dark);
    const byId = new Map(entries.map(e => [e.id, e]));
    const faceFor = (entry: EntryRow | undefined) => {
      if (!entry?.characterId) return null;
      const url = portraits[entry.characterId];
      return url ? (faces.get(url) ?? null) : null;
    };
    const built = buildTokens(
      terrain,
      tokens,
      byId,
      currentEntryId,
      p,
      faceFor,
      selectedId
    );
    w.pieces = built.pieces;
    w.activeRing = built.activeRing;
    // A token in hand stays in hand: the rebuild swaps its drawing under the
    // pointer rather than dropping it. Its group is placed where the old one
    // was and the drag carries on with the new piece.
    const held = w.drag;
    for (const [id, piece] of built.pieces) {
      if (held && id === held.tokenId) {
        piece.group.position.copy(held.piece.group.position);
        held.piece = piece;
        w.scene.add(piece.group);
        continue;
      }
      const was = previous.get(id);
      if (was && !reduce && was.distanceToSquared(piece.at) > 1e-6) {
        piece.group.position.copy(was);
        w.moving.set(id, { from: was, to: piece.at.clone(), t: 0 });
      }
      w.scene.add(piece.group);
    }
  }, [
    terrain,
    tokens,
    entries,
    currentEntryId,
    selectedId,
    dark,
    portraits,
    faces,
    reduce,
  ]);

  return (
    <div
      ref={mount}
      className="w-full overflow-hidden rounded-md border border-line"
      aria-label="The battlefield, in three dimensions. Drag to orbit, scroll to zoom, press T for straight down. Drag your own token to move it."
    />
  );
}
