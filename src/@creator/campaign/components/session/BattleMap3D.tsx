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
import {
  flameArt,
  floorArt,
  glowArt,
  masonryArt,
  outlineArt,
  planksArt,
  reachArt,
  strataArt,
} from '@/@shared/battlemap/art';
import {
  across,
  MATERIALS,
  VOID,
  type Facing,
  type TerrainDoc,
} from '@/@shared/battlemap/types';
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
/**
 * Whether a picture has a transparent ground — a cut-out — or is a painted
 * rectangle. Read once per image off its four corners and remembered, so a
 * board of eight standees samples eight times, not eight times a rebuild.
 * A tainted canvas (a remote that refused CORS) reads as a card, which is
 * the safer of the two guesses.
 */
const cutouts = new WeakMap<HTMLImageElement, boolean>();
function isCutout(img: HTMLImageElement): boolean {
  const known = cutouts.get(img);
  if (known !== undefined) return known;
  let out = false;
  try {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    const corners = [0, 7, 56, 63].map(i => d[i * 4 + 3]);
    out = corners.filter(a => a < 16).length >= 3;
  } catch {
    out = false;
  }
  cutouts.set(img, out);
  return out;
}

/** A picture ready to stand: its texture and its width per unit of height. */
interface Picture {
  tex: THREE.Texture;
  aspect: number;
}

function standeeTexture(
  text: string,
  ink: string,
  paper: string,
  border: string,
  face: HTMLImageElement | null
): Picture {
  const c = document.createElement('canvas');
  c.width = STANDEE_W;
  c.height = STANDEE_H;
  const ctx = c.getContext('2d')!;
  const inset = 10;

  // A cut-out stands as itself — a paper miniature is cut along its outline,
  // and a card behind an ogre with a raised club is a card, not an ogre. Its
  // sprite takes the picture's own proportions; the card is for paintings
  // and for initials.
  if (face && face.naturalWidth > 0 && isCutout(face)) {
    const aspect = Math.min(2, face.naturalWidth / face.naturalHeight);
    c.width = Math.round(STANDEE_H * aspect);
    const scale = Math.min(
      c.width / face.naturalWidth,
      STANDEE_H / face.naturalHeight
    );
    const dw = face.naturalWidth * scale;
    const dh = face.naturalHeight * scale;
    ctx.drawImage(face, (c.width - dw) / 2, STANDEE_H - dh, dw, dh);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, aspect };
  }

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
    const w = STANDEE_W - 2 * (inset + 4);
    const h = STANDEE_H - 2 * inset - 16;
    ctx.save();
    ctx.beginPath();
    ctx.rect(inset + 4, inset + 12, w, h);
    ctx.clip();
    // A painting covers the card, keeping its top: a portrait's face is in
    // its upper half.
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
  return { tex, aspect: STANDEE_W / STANDEE_H };
}

/**
 * Stand a picture up, `tall` units high, anchored at its foot.
 *
 * Facing the camera it is a sprite, which turns on its own; facing a side it
 * is a plane, which does not — a signpost or a door stands still while the
 * room is orbited. Both carry `userData.tokenId` for the raycast when the
 * caller sets it, and both take a `dim` the same way.
 */
function stand(
  picture: Picture,
  tall: number,
  facing: Facing
): THREE.Sprite | THREE.Mesh {
  const wide = tall * picture.aspect;
  if (facing === 'camera') {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: picture.tex, depthTest: true })
    );
    // Anchored at the foot, so it stands on the base rather than hanging
    // over it.
    sprite.center.set(0.5, 0);
    sprite.scale.set(wide, tall, 1);
    return sprite;
  }
  const geo = new THREE.PlaneGeometry(wide, tall);
  geo.translate(0, tall / 2, 0);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: picture.tex,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
    })
  );
  // A plane faces +z by default, which is south on this board (y grows
  // downward on the grid, and the grid's y is the scene's z).
  mesh.rotation.y =
    facing === 'n'
      ? Math.PI
      : facing === 'e'
        ? Math.PI / 2
        : facing === 'w'
          ? -Math.PI / 2
          : 0;
  return mesh;
}

/** Fade a standing picture, for a DM-only thing, an open door, a broken one. */
function dim(obj: THREE.Sprite | THREE.Mesh, opacity: number) {
  const mat = obj.material as THREE.Material;
  mat.transparent = true;
  mat.opacity = opacity;
}

/**
 * A picture standing on a tile: a tree, a statue, a door. The image itself,
 * no card — a cut-out tree with a parchment rectangle behind it would be a
 * tree in a frame. `feet` tall, as wide as the picture's own proportions
 * make it, anchored at its foot. Until the picture loads it is a plain
 * parchment card the same height, so the tile is not empty for a beat.
 */
function pictureTexture(
  img: HTMLImageElement | null,
  paper: string,
  border: string
): Picture {
  let tex: THREE.Texture;
  let aspect = 2 / 3;
  if (img && img.naturalWidth > 0) {
    tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    aspect = img.naturalWidth / img.naturalHeight;
  } else {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = paper;
    ctx.fillRect(2, 2, 60, 92);
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 60, 92);
    tex = new THREE.CanvasTexture(c);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect };
}

/* --- building the scene ------------------------------------------------ */

/** A drawn surface as a texture, wrapped so it can repeat. */
function artTexture(art: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(art);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Let go of everything a group holds — geometry, every material, and every
 * texture a material carries. `material.dispose()` alone leaves the texture
 * on the GPU, and a board rebuilt on every paint stroke would collect them.
 */
export function disposeGroup(group: THREE.Object3D) {
  group.traverse(obj => {
    const m = obj as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material)
      ? m.material
      : m.material
        ? [m.material]
        : [];
    for (const mat of mats) {
      const withMap = mat as THREE.Material & {
        map?: THREE.Texture | null;
        emissiveMap?: THREE.Texture | null;
      };
      withMap.map?.dispose();
      withMap.emissiveMap?.dispose();
      mat.dispose();
    }
  });
}

/** Ink pulled toward stone: masonry, pewter, iron. Never a black monolith. */
function masonryColour(p: Palette, dark: boolean): THREE.Color {
  const stone = new THREE.Color(
    dark ? MATERIALS[1].swatchDark : MATERIALS[1].swatch
  );
  return p.ink.clone().lerp(stone, dark ? 0.35 : 0.55);
}

/** The board's lowest point: every tile is a column standing on it. */
function floorOf(doc: TerrainDoc): number {
  let low = 0;
  for (let i = 0; i < doc.w * doc.h; i++) {
    if (doc.material[i] === VOID) continue;
    low = Math.min(low, doc.elevation[i] / FEET_PER_UNIT);
  }
  return low - SLAB;
}

/**
 * Exported for verification. The scene is built apart from any DOM except the
 * label sprites, so the geometry — where a wall lands, how tall a ledge is —
 * can be asserted headlessly the way the rules in `lib/battlemap.ts` are.
 */
export function buildTerrain(
  doc: TerrainDoc,
  p: Palette,
  dark: boolean,
  pictureFor: (imageId: string) => HTMLImageElement | null = () => null
): THREE.Group {
  const group = new THREE.Group();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bottom = floorOf(doc);
  const masonry = masonryColour(p, dark);

  // Floor: one instanced mesh per material, each tile a column from the
  // board's lowest point to its own top, so a pit shows its neighbours'
  // sides and a ledge shows its own. One draw call per material rather than
  // per tile. Capacity is the tile count per material, fixed at construction
  // — the Three.js trap the handoff names: you cannot push an instance onto
  // an existing mesh.
  //
  // The top face wears the material's own drawing and the sides wear earth
  // in layers — a box has six material slots, and instancing keeps them.
  const byMaterial = new Map<number, number[]>();
  for (let i = 0; i < doc.w * doc.h; i++) {
    const m = doc.material[i];
    if (m === VOID) continue;
    if (!byMaterial.has(m)) byMaterial.set(m, []);
    byMaterial.get(m)!.push(i);
  }
  const tmp = new THREE.Object3D();
  const strata = new THREE.MeshStandardMaterial({
    map: artTexture(strataArt(dark)),
    roughness: 0.95,
  });
  const jitter = new THREE.Color();
  for (const [m, tiles] of byMaterial) {
    const spec = MATERIALS[m];
    const art = floorArt(spec.key, dark);
    const top = new THREE.MeshStandardMaterial({
      map: art ? artTexture(art) : null,
      color: art ? '#ffffff' : dark ? spec.swatchDark : spec.swatch,
      roughness: spec.key === 'water' ? 0.6 : 0.95,
      metalness: 0,
      // Water and lava glow faintly rather than reflect; it reads better on a
      // parchment ground than a mirror does.
      emissive:
        spec.key === 'lava'
          ? new THREE.Color('#7a2a12')
          : spec.key === 'water'
            ? new THREE.Color(dark ? '#0f1a26' : '#16232e')
            : new THREE.Color('#000000'),
      emissiveIntensity: spec.key === 'lava' ? 0.7 : 0.3,
    });
    // +x, -x, +y, -y, +z, -z
    const mesh = new THREE.InstancedMesh(
      unit,
      [strata, strata, top, strata, strata, strata],
      tiles.length
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tiles.forEach((i, k) => {
      const x = i % doc.w;
      const z = Math.floor(i / doc.w);
      const tileTop = doc.elevation[i] / FEET_PER_UNIT;
      const height = tileTop - bottom;
      tmp.position.set(x + 0.5, bottom + height / 2, z + 0.5);
      tmp.scale.set(0.998, height, 0.998);
      tmp.updateMatrix();
      mesh.setMatrixAt(k, tmp.matrix);
      // No two flagstones the same shade: a little seeded variation per
      // tile, multiplied into the drawing, so a floor is not wallpaper.
      const v = 0.9 + (((i * 2654435761) % 1000) / 1000) * 0.2;
      jitter.setScalar(v);
      mesh.setColorAt(k, jitter);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // The raycast gives back an instance id; this is how it becomes a tile.
    // Against the floor instances and nothing else — not invisible planes per
    // elevation level, which the handoff warns you will fight forever.
    mesh.userData.tiles = tiles;
    mesh.userData.floor = true;
    group.add(mesh);
  }

  /* --- walls ---------------------------------------------------------- */

  // Where an edge sits: its centre, the height of the higher of its two
  // tiles, and whether it runs along x (north/south edges) or along z.
  const edgeOf = (w: TerrainDoc['walls'][number]) => {
    const i = w.y * doc.w + w.x;
    const here = doc.elevation[i] ?? 0;
    const [ax, az] = across(w.x, w.y, w.side);
    const there =
      ax >= 0 && az >= 0 && ax < doc.w && az < doc.h
        ? (doc.elevation[az * doc.w + ax] ?? 0)
        : here;
    return {
      cx: w.x + 0.5 + (w.side === 'e' ? 0.5 : w.side === 'w' ? -0.5 : 0),
      cz: w.y + 0.5 + (w.side === 's' ? 0.5 : w.side === 'n' ? -0.5 : 0),
      base: Math.max(here, there) / FEET_PER_UNIT,
      alongX: w.side === 'n' || w.side === 's',
    };
  };

  const stoneMat = new THREE.MeshStandardMaterial({
    map: artTexture(masonryArt(dark)),
    roughness: 0.85,
  });
  const copingMat = new THREE.MeshStandardMaterial({
    color: masonry.clone().lerp(new THREE.Color('#000000'), 0.25),
    roughness: 0.8,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: dark ? '#4a443e' : '#3a3530',
    roughness: 0.55,
    metalness: 0.5,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    map: artTexture(planksArt(dark, true)),
    roughness: 0.8,
  });
  const paneMat = new THREE.MeshStandardMaterial({
    color: p.arcane,
    roughness: 0.1,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });

  const WALL_T = 0.18;
  const solids = doc.walls.filter(w => w.kind === 'solid');
  if (solids.length) {
    // A wall is masonry with a coping along the top: the cap is what makes
    // an extruded box read as a wall somebody built rather than a slab.
    const body = new THREE.InstancedMesh(unit, stoneMat, solids.length);
    const cap = new THREE.InstancedMesh(unit, copingMat, solids.length);
    body.castShadow = cap.castShadow = true;
    body.receiveShadow = cap.receiveShadow = true;
    solids.forEach((w, k) => {
      const e = edgeOf(w);
      const h = w.height / FEET_PER_UNIT;
      tmp.position.set(e.cx, e.base + h / 2, e.cz);
      tmp.scale.set(e.alongX ? 1 : WALL_T, h, e.alongX ? WALL_T : 1);
      tmp.updateMatrix();
      body.setMatrixAt(k, tmp.matrix);
      tmp.position.set(e.cx, e.base + h + 0.03, e.cz);
      tmp.scale.set(
        e.alongX ? 1.04 : WALL_T + 0.1,
        0.06,
        e.alongX ? WALL_T + 0.1 : 1.04
      );
      tmp.updateMatrix();
      cap.setMatrixAt(k, tmp.matrix);
    });
    body.instanceMatrix.needsUpdate = true;
    cap.instanceMatrix.needsUpdate = true;
    group.add(body, cap);
  }

  for (const w of doc.walls) {
    if (w.kind === 'solid') continue;
    const e = edgeOf(w);
    const h = w.height / FEET_PER_UNIT;
    const piece = new THREE.Group();
    piece.position.set(e.cx, e.base, e.cz);
    // Built along local x; turned to lie along z for an east/west edge.
    piece.rotation.y = e.alongX ? 0 : Math.PI / 2;

    if (w.kind === 'door') {
      // Two jambs and a lintel in stone, and a plank leaf between them. A
      // closed door fills its frame; an open one is swung on its hinge, so
      // the gap reads as a gap and the door as a door.
      const jambW = 0.1;
      for (const sx of [-0.5 + jambW / 2, 0.5 - jambW / 2]) {
        const jamb = new THREE.Mesh(unit, stoneMat);
        jamb.scale.set(jambW, h, WALL_T);
        jamb.position.set(sx, h / 2, 0);
        jamb.castShadow = jamb.receiveShadow = true;
        piece.add(jamb);
      }
      const lintel = new THREE.Mesh(unit, copingMat);
      lintel.scale.set(1.04, 0.14, WALL_T + 0.08);
      lintel.position.set(0, h - 0.07, 0);
      lintel.castShadow = true;
      piece.add(lintel);
      const leafW = 1 - 2 * jambW;
      const hinge = new THREE.Group();
      hinge.position.set(-0.5 + jambW, 0, 0);
      const leaf = new THREE.Mesh(unit, leafMat);
      leaf.scale.set(leafW, h - 0.14, 0.07);
      leaf.position.set(leafW / 2, (h - 0.14) / 2, 0);
      leaf.castShadow = true;
      hinge.add(leaf);
      if (w.open) hinge.rotation.y = -Math.PI * 0.45;
      piece.add(hinge);
    } else if (w.kind === 'window') {
      // A sill, a lintel, jambs, and a pane of the arcane tint between.
      const sillH = Math.min(0.5, h * 0.3);
      const sill = new THREE.Mesh(unit, stoneMat);
      sill.scale.set(1, sillH, WALL_T);
      sill.position.set(0, sillH / 2, 0);
      sill.castShadow = sill.receiveShadow = true;
      piece.add(sill);
      const lintel = new THREE.Mesh(unit, stoneMat);
      lintel.scale.set(1, 0.16, WALL_T);
      lintel.position.set(0, h - 0.08, 0);
      lintel.castShadow = true;
      piece.add(lintel);
      for (const sx of [-0.46, 0.46]) {
        const jamb = new THREE.Mesh(unit, stoneMat);
        jamb.scale.set(0.08, h, WALL_T);
        jamb.position.set(sx, h / 2, 0);
        piece.add(jamb);
      }
      const pane = new THREE.Mesh(unit, paneMat);
      pane.scale.set(0.84, h - sillH - 0.16, 0.03);
      pane.position.set(0, sillH + (h - sillH - 0.16) / 2, 0);
      piece.add(pane);
    } else {
      // A rail: two posts and two rails, in iron.
      for (const sx of [-0.47, 0.47]) {
        const post = new THREE.Mesh(unit, ironMat);
        post.scale.set(0.06, h, 0.06);
        post.position.set(sx, h / 2, 0);
        post.castShadow = true;
        piece.add(post);
      }
      for (const y of [h, h * 0.5]) {
        const rail = new THREE.Mesh(unit, ironMat);
        rail.scale.set(1, 0.05, 0.05);
        rail.position.set(0, y, 0);
        rail.castShadow = true;
        piece.add(rail);
      }
    }
    group.add(piece);
  }

  /* --- props ---------------------------------------------------------- */

  const woodMat = new THREE.MeshStandardMaterial({
    map: artTexture(planksArt(dark, false)),
    roughness: 0.85,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    map: artTexture(planksArt(dark, true)),
    roughness: 0.85,
  });
  const leafColour = new THREE.Color(
    dark ? MATERIALS[3].swatchDark : MATERIALS[3].swatch
  );
  const canopyMat = new THREE.MeshStandardMaterial({
    color: leafColour.clone().lerp(new THREE.Color('#1f3a1a'), 0.35),
    roughness: 0.9,
  });
  const trunkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dark ? '#3a2a1a' : '#5a3f28'),
    roughness: 0.95,
  });
  const gildMat = new THREE.MeshStandardMaterial({
    color: p.gold,
    roughness: 0.35,
    metalness: 0.6,
  });
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
  const sphere = new THREE.SphereGeometry(0.5, 12, 10);
  const shadowed = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  for (const pr of doc.props) {
    const i = pr.y * doc.w + pr.x;
    const top = (doc.elevation[i] ?? 0) / FEET_PER_UNIT;
    if (pr.kind === 'image') {
      const picture = pictureTexture(
        pr.imageId ? pictureFor(pr.imageId) : null,
        '#ece3cf',
        `#${p.gold.getHexString()}`
      );
      const standing = stand(
        picture,
        (pr.height ?? 10) / FEET_PER_UNIT,
        pr.facing ?? 'camera'
      );
      standing.position.set(pr.x + 0.5, top + 0.01, pr.y + 0.5);
      group.add(standing);
      continue;
    }
    // Furniture, assembled from a few solids rather than one. Drawn, never
    // typed, and each recognisable from the default camera: a barrel has
    // hoops, a pillar a capital, a tree a trunk under its crown.
    const piece = new THREE.Group();
    piece.position.set(pr.x + 0.5, top, pr.y + 0.5);
    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      sx: number,
      sy: number,
      sz: number,
      y: number,
      x = 0,
      z = 0
    ) => {
      const m = shadowed(new THREE.Mesh(geo, mat));
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      piece.add(m);
      return m;
    };
    switch (pr.kind) {
      case 'barrel':
        add(cylinder, barrelMat, 0.56, 0.72, 0.56, 0.36);
        add(cylinder, ironMat, 0.52, 0.04, 0.52, 0.72);
        break;
      case 'pillar':
        add(cylinder, stoneMat, 0.7, 0.12, 0.7, 0.06);
        add(cylinder, stoneMat, 0.46, 2, 0.46, 1.06);
        add(unit, copingMat, 0.76, 0.12, 0.76, 2.12);
        break;
      case 'tree':
        add(cylinder, trunkMat, 0.16, 0.9, 0.16, 0.45);
        add(sphere, canopyMat, 1.1, 0.95, 1.1, 1.15);
        add(sphere, canopyMat, 0.8, 0.7, 0.8, 1.55, 0.2, -0.15);
        add(sphere, canopyMat, 0.7, 0.65, 0.7, 1.45, -0.25, 0.2);
        break;
      case 'rubble':
        add(sphere, stoneMat, 0.4, 0.28, 0.36, 0.12, -0.18, 0.1);
        add(sphere, stoneMat, 0.3, 0.22, 0.3, 0.1, 0.2, -0.15);
        add(sphere, stoneMat, 0.22, 0.18, 0.24, 0.08, 0.1, 0.25);
        break;
      case 'statue':
        add(unit, stoneMat, 0.7, 0.3, 0.7, 0.15);
        add(unit, copingMat, 0.5, 0.08, 0.5, 0.34);
        add(cylinder, stoneMat, 0.3, 1.0, 0.3, 0.88);
        add(sphere, stoneMat, 0.28, 0.3, 0.28, 1.5);
        break;
      case 'altar':
        add(unit, stoneMat, 0.9, 0.6, 0.6, 0.3);
        add(unit, copingMat, 1.0, 0.1, 0.7, 0.65);
        add(unit, gildMat, 0.12, 0.3, 0.12, 0.85);
        break;
      case 'chest':
        add(unit, woodMat, 0.7, 0.4, 0.5, 0.2);
        add(unit, woodMat, 0.72, 0.16, 0.52, 0.48);
        add(unit, ironMat, 0.74, 0.04, 0.54, 0.4);
        add(unit, gildMat, 0.1, 0.12, 0.05, 0.42, 0, 0.27);
        break;
      default: {
        // A table: a top on four legs.
        add(unit, woodMat, 0.9, 0.08, 0.7, 0.66);
        for (const [x, z] of [
          [-0.38, -0.28],
          [0.38, -0.28],
          [-0.38, 0.28],
          [0.38, 0.28],
        ]) {
          add(unit, woodMat, 0.08, 0.62, 0.08, 0.31, x, z);
        }
      }
    }
    group.add(piece);
  }

  /* --- braziers ------------------------------------------------------- */

  // The warmth is the whole point of the palette: an iron bowl on a post,
  // coals, a still flame, a pool of light on the floor, and the point light
  // that does the real work. Nothing flickers.
  const flame = artTexture(flameArt());
  const pool = artTexture(glowArt());
  for (const l of doc.lights) {
    const i = l.y * doc.w + l.x;
    const top = (doc.elevation[i] ?? 0) / FEET_PER_UNIT;
    const piece = new THREE.Group();
    piece.position.set(l.x + 0.5, top, l.y + 0.5);
    const post = shadowed(new THREE.Mesh(cylinder, ironMat));
    post.scale.set(0.08, 0.5, 0.08);
    post.position.y = 0.25;
    const bowl = shadowed(
      new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.16, 12), ironMat)
    );
    bowl.position.y = 0.56;
    const coals = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ff9a3c' })
    );
    coals.position.y = 0.6;
    const fire = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flame,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      })
    );
    fire.center.set(0.5, 0);
    fire.scale.set(0.34, 0.5, 1);
    fire.position.y = 0.58;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: pool,
        color: p.gold,
        transparent: true,
        opacity: dark ? 0.4 : 0.28,
        depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    const reach = l.radius / FEET_PER_UNIT;
    glow.scale.set(reach * 1.2, reach * 1.2, 1);
    glow.position.y = 0.012;
    const light = new THREE.PointLight(p.gold, dark ? 9 : 4, reach * 1.4, 1.7);
    light.position.y = 0.9;
    piece.add(post, bowl, coals, fire, glow, light);
    group.add(piece);
  }

  return group;
}

/**
 * The table the board stands on: a wide, plain surface fading into the
 * distance, so the room sits on something rather than floating in a void.
 * The design language's own ground colour at the centre, darkening toward
 * the edge — a desk in the parchment palette, a table in candlelight.
 */
export function buildTable(doc: TerrainDoc, dark: boolean): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 96);
  g.addColorStop(0, dark ? '#2a2219' : '#f1eadb');
  g.addColorStop(1, dark ? '#0d0a07' : '#d6cab1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const span = Math.max(doc.w, doc.h);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 7, span * 7),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(doc.w / 2, floorOf(doc) - 0.02, doc.h / 2);
  mesh.receiveShadow = true;
  return mesh;
}

/** The colour the table fades to, which the fog and the backdrop share. */
export function horizonColour(dark: boolean): THREE.Color {
  return new THREE.Color(dark ? '#0d0a07' : '#d6cab1');
}

/* --- tokens ------------------------------------------------------------ */

/** A name over a standee: parchment letters on a dark pill, one draw call. */
function nameplate(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 72;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 32px ui-sans-serif, system-ui';
  const w = Math.min(300, ctx.measureText(text).width + 36);
  const x = (320 - w) / 2;
  ctx.fillStyle = 'rgba(22,18,14,0.78)';
  ctx.beginPath();
  ctx.roundRect(x, 10, w, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#f1e9d6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 37, 280);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  );
  sprite.scale.set(1.2, 0.27, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
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
  /** The active-turn marker, so the loop can turn it. Null when nobody's turn. */
  activeRing: THREE.Object3D | null;
}

export function buildTokens(
  doc: TerrainDoc,
  tokens: BattleTokenRow[],
  entries: Map<string, EntryRow>,
  currentEntryId: string | null,
  p: Palette,
  faceFor: (
    entry: EntryRow | undefined,
    token: BattleTokenRow
  ) => HTMLImageElement | null = () => null,
  selectedId: string | null = null,
  dark = true
): TokenScene {
  const pieces = new Map<string, TokenPiece>();
  let activeRing: THREE.Object3D | null = null;
  const ring = artTexture(glowArt(0.55));
  // Pewter in candlelight, a warmer grey on parchment — a dark disc on the
  // light board read as a hole in the floor.
  const pewter = new THREE.MeshStandardMaterial({
    color: dark ? '#4c463e' : '#8a8173',
    roughness: 0.45,
    metalness: 0.35,
  });
  const shadowArt = artTexture(glowArt());

  for (const t of tokens) {
    const group = new THREE.Group();
    const entry = t.entryId ? entries.get(t.entryId) : undefined;
    const label = entry?.label ?? t.label ?? '';
    const i = t.y * doc.w + t.x;
    const top =
      (doc.elevation[i] ?? 0) / FEET_PER_UNIT + t.altitude / FEET_PER_UNIT;
    // A miniature's base: a third of a tile for a medium creature, growing
    // with the footprint. Smaller than the tile on purpose — the base is the
    // stand, not the piece.
    const r = 0.3 * t.footprint;
    const at = new THREE.Vector3(
      t.x + t.footprint / 2,
      top,
      t.y + t.footprint / 2
    );
    group.position.copy(at);
    const faint = t.visibility === 'dm';

    const sideColour =
      entry?.side === 'foe'
        ? p.danger
        : entry?.side === 'party'
          ? p.gold
          : p.inkMuted;

    // Under everything, a soft ring of the side's colour on the floor: whose
    // this is, readable from across the room, without painting the whole
    // tile. Which side is state, so it keeps its colour (rule 6).
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: ring,
        color: sideColour,
        transparent: true,
        opacity: faint ? 0.25 : 0.6,
        depthWrite: false,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.scale.set(r * 3.6, r * 3.6, 1);
    halo.position.y = 0.014;
    group.add(halo);

    // A sprite casts no shadow, so a soft dark pool under the base stands
    // in for one: the difference between a piece on the floor and a piece
    // hovering over it.
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: shadowArt,
        color: '#000000',
        transparent: true,
        opacity: faint ? 0.15 : 0.35,
        depthWrite: false,
      })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.scale.set(r * 2.8, r * 2.8, 1);
    contact.position.y = 0.016;
    group.add(contact);

    // Pewter, with the side's colour as a rim. The stand a paper miniature
    // slots into, not a coloured counter.
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.96, r, 0.1, 32),
      faint
        ? new THREE.MeshStandardMaterial({
            color: pewter.color,
            roughness: 0.45,
            metalness: 0.4,
            transparent: true,
            opacity: 0.45,
          })
        : pewter
    );
    base.position.y = 0.05;
    base.castShadow = true;
    base.userData.tokenId = t.id;
    group.add(base);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.96, 0.028, 8, 48),
      new THREE.MeshStandardMaterial({
        color: sideColour,
        emissive: sideColour,
        emissiveIntensity: 0.5,
        roughness: 0.4,
        transparent: faint,
        opacity: faint ? 0.5 : 1,
      })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    rim.userData.tokenId = t.id;
    group.add(rim);

    // HP as an arc round the base, by the HeroCard rule: the tone says how
    // it is going, the arc's length says how much is left. The server nulled
    // a foe's numbers for a player, so a player sees no arc on a foe — as the
    // tracker shows a word.
    if (entry && entry.hpCurrent !== null && entry.hpMax) {
      const ratio = Math.max(0, Math.min(1, entry.hpCurrent / entry.hpMax));
      const tone =
        ratio > 0.5 ? p.success : ratio > 0.25 ? p.warning : p.danger;
      const track = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.07, 0.022, 6, 48),
        new THREE.MeshBasicMaterial({
          color: '#000000',
          transparent: true,
          opacity: 0.35,
        })
      );
      track.rotation.x = Math.PI / 2;
      track.position.y = 0.03;
      group.add(track);
      if (ratio > 0) {
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(
            r + 0.07,
            0.032,
            8,
            Math.max(3, Math.round(48 * ratio)),
            Math.PI * 2 * ratio
          ),
          new THREE.MeshBasicMaterial({ color: tone })
        );
        arc.rotation.x = Math.PI / 2;
        // Starts at the back and runs clockwise, so what is missing is
        // missing from the front where the standee stands.
        arc.rotation.z = Math.PI / 2 + Math.PI * (1 - ratio);
        arc.position.y = 0.035;
        group.add(arc);
      }
    }

    // Whose turn it is. Gold, and the one thing on the board that moves: a
    // ring with four pips, turned by the loop, so the turning shows.
    if (entry && entry.id === currentEntryId) {
      const marker = new THREE.Group();
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.2, 0.024, 8, 56),
        new THREE.MeshBasicMaterial({ color: p.gold })
      );
      band.rotation.x = Math.PI / 2;
      marker.add(band);
      for (let k = 0; k < 4; k++) {
        const pip = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 8, 6),
          new THREE.MeshBasicMaterial({ color: p.gold })
        );
        const a = (k / 4) * Math.PI * 2;
        pip.position.set(Math.cos(a) * (r + 0.2), 0, Math.sin(a) * (r + 0.2));
        marker.add(pip);
      }
      marker.position.y = 0.04;
      group.add(marker);
      activeRing = marker;
    }

    // The selected token — the target, the foe on the shelf. Ink, thin, and
    // outside the turn ring, so the two never read as one mark.
    if (t.id === selectedId) {
      const sel = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.32, 0.022, 8, 56),
        new THREE.MeshBasicMaterial({ color: p.ink })
      );
      sel.rotation.x = Math.PI / 2;
      sel.position.y = 0.04;
      group.add(sel);
    }

    // The standee. A medium creature's card is a tile and a quarter tall
    // and two thirds as wide; a large one's grows with its footprint. Dimmed
    // with the base for a token only the DM can see.
    // Paper is paper in candlelight: the card is parchment and the letters
    // ink in both palettes, and only the border takes the palette's gold. A
    // card that went black with the room read as a slab, not a miniature.
    const picture = standeeTexture(
      initials(label),
      '#2b2620',
      '#ece3cf',
      `#${p.gold.getHexString()}`,
      faceFor(entry, t)
    );
    const tall = 1.25 * t.footprint;
    const standing = stand(picture, tall, t.facing);
    standing.position.y = 0.1;
    /*
     * What state it is in, drawn: a thing only the DM can see is faint; an
     * open door standing still swings out of its frame; an open door facing
     * the camera has nothing to swing on, so it fades instead; a broken
     * thing is nearly gone. Nothing here animates — it is where the thing
     * is, not where it is going.
     */
    if (faint) dim(standing, 0.55);
    if (t.state === 'open') {
      if (t.facing !== 'camera') standing.rotation.y += (Math.PI / 2) * 0.85;
      else dim(standing, 0.6);
    }
    if (t.state === 'broken') dim(standing, 0.3);
    standing.userData.tokenId = t.id;
    group.add(standing);

    // Who it is, over its head. A name is the first thing a table asks.
    if (label.trim()) {
      const plate = nameplate(label.trim());
      plate.position.y = 0.1 + tall + 0.1;
      if (faint) plate.material.opacity = 0.55;
      group.add(plate);
    }

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
  /**
   * The pictures that have loaded, by URL, from the cache the 2D board
   * shares — portraits, token images and prop images alike.
   */
  faces: Map<string, HTMLImageElement>;
  /** Composes a campaign image's URL, so this view never learns the route. */
  imageUrlFor: (imageId: string) => string;
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
   * commonest reason to tap one. Null when a tap on bare floor lets the
   * selection go.
   */
  onSelect?: (tokenId: string | null) => void;
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
  imageUrlFor,
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
    selectedId,
  });
  latest.current = {
    terrain,
    tokens,
    entries,
    onMove,
    speedOf,
    onSelect,
    selectedId,
  };

  // Long-lived pieces, created once per mount.
  const world = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    terrainGroup: THREE.Group | null;
    table: THREE.Mesh | null;
    pieces: Map<string, TokenPiece>;
    /** Tokens on their way somewhere: ~250ms ease-out, per the handoff. */
    moving: Map<string, { from: THREE.Vector3; to: THREE.Vector3; t: number }>;
    activeRing: THREE.Object3D | null;
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
    /** The lit tiles: a drag's reach, or the selected token's. */
    ghost: THREE.Group | null;
    /** The tile under the pointer, when a tap there would mean something. */
    hoverMarker: THREE.Mesh;
    /** Where the last pointer-down landed, so a tap can be told from a drag. */
    press: { x: number; y: number; tokenId: string | null } | null;
    /** Light the selected token's reach again, after a rebuild or a drop. */
    relight?: () => void;
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
    renderer.toneMappingExposure = dark ? 1.3 : 1.1;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // By the flag rather than the CSS variable: on a theme toggle
    // `resolvedTheme` flips a beat before the class lands on <html>, and a
    // palette read in that beat is the old one. The backdrop is the colour
    // the table fades to, so the table's edge is never a visible line.
    const horizon = horizonColour(dark);
    scene.background = horizon;
    const cx = terrain.w / 2;
    const cz = terrain.h / 2;
    const span = Math.max(terrain.w, terrain.h);
    scene.fog = new THREE.Fog(horizon, span * 2.2, span * 6);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, span * 12);
    /*
     * Where the camera starts is decided by the frame, not by the board's
     * span: a fixed bearing — low enough to be cinematic, high enough that
     * a ledge still reads — at whatever distance puts every corner of the
     * board just inside this canvas's edges. The board's *box* is fitted,
     * not its bounding sphere: the sphere left a long room small in the
     * middle of the canvas, which is the "cramped" the first look was
     * called. Done once, on the first layout; after that the orbit is the
     * reader's.
     */
    const bearing = new THREE.Vector3(0.3, 0.78, 1).normalize();
    const centre = new THREE.Vector3(cx, 0, cz);
    let framed = false;
    const frame = () => {
      let tallest = 0;
      for (let i = 0; i < terrain.w * terrain.h; i++) {
        if (terrain.material[i] !== VOID)
          tallest = Math.max(tallest, terrain.elevation[i] / FEET_PER_UNIT);
      }
      const corners: THREE.Vector3[] = [];
      for (const x of [0, terrain.w])
        for (const z of [0, terrain.h])
          for (const y of [-SLAB, tallest + 1.6])
            corners.push(new THREE.Vector3(x, y, z));
      const fits = (dist: number) => {
        camera.position.copy(bearing).multiplyScalar(dist).add(centre);
        camera.lookAt(centre);
        camera.updateMatrixWorld();
        const v = new THREE.Vector3();
        for (const c of corners) {
          v.copy(c).project(camera);
          if (Math.abs(v.x) > 0.96 || Math.abs(v.y) > 0.96) return false;
        }
        return true;
      };
      let lo = 2;
      let hi = span * 6;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      fits(hi);
      // A narrow canvas can want more distance than the orbit's ceiling
      // allows; the ceiling gives way rather than the framing.
      controls.maxDistance = Math.max(controls.maxDistance, hi * 1.5);
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(centre);
    // Never under the floor, never quite flat: 5°–80° from vertical.
    // Straight down is reached by the hotkey, which lerps past the orbit's
    // own floor.
    controls.minPolarAngle = THREE.MathUtils.degToRad(5);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
    controls.minDistance = 2;
    controls.maxDistance = span * 3;
    controls.enableDamping = !reduce;
    controls.dampingFactor = 0.08;
    controls.update();

    // Lighting: one warm key that casts the only shadow, a cool rim from
    // the far side so standees and walls have an edge, a sky fill so the
    // undersides of ledges are not black. Steep, so a ten-foot wall throws
    // a short shadow rather than one that swallows the room beside it.
    // Brighter in the dark palette than the number looks: the floor there
    // starts nearly black and needs the light to read at all.
    // The sun stands on the camera's side of the board — south-east, where
    // the opening view looks from — so the faces the reader sees first are
    // the lit ones and shadows fall away behind things. The first cut had
    // it north-west, and every wall the camera faced was its own shadow.
    const sun = new THREE.DirectionalLight(p.gold, dark ? 3.2 : 2.2);
    sun.position.set(cx + span * 0.35, span * 1.6, cz + span * 0.55);
    sun.target.position.copy(centre);
    sun.castShadow = true;
    sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = span * 4;
    const ortho = sun.shadow.camera as THREE.OrthographicCamera;
    ortho.left = -span;
    ortho.right = span;
    ortho.top = span;
    ortho.bottom = -span;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(
      new THREE.Color('#9fb4cf'),
      dark ? 1.6 : 0.6
    );
    rim.position.set(cx - span * 0.7, span * 0.8, cz - span * 0.8);
    rim.target.position.copy(centre);
    scene.add(rim, rim.target);
    scene.add(new THREE.HemisphereLight(p.surface, p.ink, dark ? 1.0 : 0.45));
    scene.add(
      new THREE.AmbientLight(new THREE.Color('#8aa4bd'), dark ? 0.7 : 0.25)
    );

    // The tile under the pointer, lit in gold when a tap there would move
    // the selected token, in the danger tone when it cannot stand there.
    const hoverMarker = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: (() => {
          const t = new THREE.CanvasTexture(outlineArt());
          t.colorSpace = THREE.SRGBColorSpace;
          return t;
        })(),
        color: p.gold,
        transparent: true,
        depthWrite: false,
      })
    );
    hoverMarker.rotation.x = -Math.PI / 2;
    hoverMarker.visible = false;
    hoverMarker.renderOrder = 5;
    scene.add(hoverMarker);

    world.current = {
      renderer,
      scene,
      camera,
      controls,
      terrainGroup: null,
      table: null,
      pieces: new Map(),
      moving: new Map(),
      activeRing: null,
      sun,
      frame: 0,
      lerp: null,
      drag: null,
      ghost: null,
      hoverMarker,
      press: null,
    };

    // Whatever sits above the canvas inside the region is measured rather
    // than guessed — the same rule the 2D board applies to `fitHeight`.
    const region = fill ? el.closest('[data-board-region]') : null;
    const resize = () => {
      const w = el.clientWidth;
      let h = Math.max(320, Math.round(w * 0.66));
      if (region) {
        const above =
          el.getBoundingClientRect().top - region.getBoundingClientRect().top;
        // The status line and the scrawl under the canvas keep their room.
        h = Math.max(320, region.clientHeight - above - 72);
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
    // people actually fight in. "f" frames the whole board again from the
    // opening angle. The lerp is the continuity that sells the feature;
    // under reduced motion it is a cut.
    const onKey = (ev: KeyboardEvent) => {
      const w = world.current;
      if (!w) return;
      let to: THREE.Vector3;
      if (ev.key === 't' || ev.key === 'T') {
        to = new THREE.Vector3(cx, span * 1.3, cz + 0.001);
      } else if (ev.key === 'f' || ev.key === 'F') {
        const was = camera.position.clone();
        frame();
        to = camera.position.clone();
        camera.position.copy(was);
      } else {
        return;
      }
      controls.target.copy(centre);
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
     *
     * A tap is the other way in, and the easier one on a phone: tap your
     * token to select it — its reach lights — then tap a lit tile to walk
     * there. The same two taps the 2D board takes. A pointer-up that has
     * travelled is an orbit, not a tap, and does nothing to the board.
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
        for (const child of piece.group.children)
          if (child.userData.tokenId) bodies.push(child);
      const hit = ray.intersectObjects(bodies, false)[0];
      return (hit?.object.userData.tokenId as string | undefined) ?? null;
    };

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
    // The same reach the 2D board draws — one helper, so the two views
    // cannot disagree about where a token may go.
    const reachOf = (token: BattleTokenRow) =>
      reachFor(
        latest.current.terrain,
        asReach(token),
        latest.current.tokens.map(asReach),
        latest.current.speedOf?.(token) ?? 30
      );

    const lightGhost = (reach: Map<number, number>, opacity: number) => {
      const w = world.current;
      if (!w) return;
      darkenGhost();
      const doc = latest.current.terrain;
      const g = new THREE.Group();
      const geo = new THREE.PlaneGeometry(1, 1);
      const tex = new THREE.CanvasTexture(reachArt());
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: p.gold,
        transparent: true,
        opacity,
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
    function darkenGhost() {
      const w = world.current;
      if (!w?.ghost) return;
      scene.remove(w.ghost);
      disposeGroup(w.ghost);
      w.ghost = null;
    }
    /** Light the selected token's reach, if it is the reader's to move. */
    const relight = () => {
      const w = world.current;
      if (!w || w.drag) return;
      darkenGhost();
      const id = latest.current.selectedId;
      const token = id ? latest.current.tokens.find(t => t.id === id) : null;
      if (!token || !token.mine || !latest.current.onMove) return;
      // Gold on pale stone needs more weight than gold on dark.
      lightGhost(reachOf(token), dark ? 0.55 : 0.9);
    };
    world.current.relight = relight;

    /** Ask the server to put a token on a tile, having put it there already. */
    const settle = async (
      tokenId: string,
      piece: TokenPiece,
      from: THREE.Vector3,
      to: { x: number; y: number }
    ) => {
      const doc = latest.current.terrain;
      const token = latest.current.tokens.find(t => t.id === tokenId);
      if (!token) return;
      const top = doc.elevation[to.y * doc.w + to.x] / FEET_PER_UNIT;
      piece.at.set(to.x + token.footprint / 2, top, to.y + token.footprint / 2);
      piece.group.position.copy(piece.at);
      const ok = await latest.current.onMove?.(tokenId, to);
      if (!ok) {
        piece.at.copy(from);
        piece.group.position.copy(from);
      }
    };

    const onDown = (ev: PointerEvent) => {
      const w = world.current;
      if (!w || ev.button !== 0) return;
      const id = tokenUnder(ev);
      w.press = { x: ev.clientX, y: ev.clientY, tokenId: id };
      if (!id) return;
      latest.current.onSelect?.(id);
      const token = latest.current.tokens.find(t => t.id === id);
      const piece = w.pieces.get(id);
      if (!token || !piece || !token.mine || !latest.current.onMove) return;

      const reach = reachOf(token);
      w.drag = {
        tokenId: id,
        piece,
        from: piece.at.clone(),
        reach,
        hover: null,
      };
      w.moving.delete(id);
      piece.group.position.y = piece.at.y + 0.35;
      lightGhost(reach, dark ? 0.8 : 1);
      w.hoverMarker.visible = false;
      controls.enabled = false;
      renderer.domElement.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    };
    const onMovePointer = (ev: PointerEvent) => {
      const w = world.current;
      if (!w) return;
      const doc = latest.current.terrain;
      if (w.drag) {
        const tile = floorTileUnder(ev);
        w.drag.hover = tile;
        const token = latest.current.tokens.find(t => t.id === w.drag!.tokenId);
        if (tile && token) {
          const top = doc.elevation[tile.y * doc.w + tile.x] / FEET_PER_UNIT;
          w.drag.piece.group.position.set(
            tile.x + token.footprint / 2,
            top + 0.35,
            tile.y + token.footprint / 2
          );
        }
        return;
      }
      // Nothing in hand: say what a tap here would do. A hand over a token,
      // a lit square over a tile the selected token could walk to.
      const over = tokenUnder(ev);
      if (over) {
        renderer.domElement.style.cursor = 'pointer';
        w.hoverMarker.visible = false;
        return;
      }
      const id = latest.current.selectedId;
      const token = id ? latest.current.tokens.find(t => t.id === id) : null;
      const tile = token && token.mine ? floorTileUnder(ev) : null;
      if (!tile || !token) {
        renderer.domElement.style.cursor = 'grab';
        w.hoverMarker.visible = false;
        return;
      }
      const others = latest.current.tokens.filter(t => t.id !== token.id);
      const ok = canStand(
        doc,
        { x: tile.x, y: tile.y, footprint: token.footprint },
        others
      );
      const mat = w.hoverMarker.material as THREE.MeshBasicMaterial;
      mat.color.copy(ok ? p.gold : p.danger);
      w.hoverMarker.scale.set(token.footprint, token.footprint, 1);
      w.hoverMarker.position.set(
        tile.x + token.footprint / 2,
        doc.elevation[tile.y * doc.w + tile.x] / FEET_PER_UNIT + 0.03,
        tile.y + token.footprint / 2
      );
      w.hoverMarker.visible = true;
      renderer.domElement.style.cursor = ok ? 'pointer' : 'not-allowed';
    };
    const onUp = async (ev: PointerEvent) => {
      const w = world.current;
      if (!w) return;
      const press = w.press;
      w.press = null;
      const travelled =
        press && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 6;

      if (!w.drag) {
        // A tap on the floor, with a token of the reader's selected: walk
        // there. A tap on nothing in particular lets the selection go, the
        // way the 2D board does. An orbit is neither.
        if (!press || travelled || press.tokenId) return;
        const tile = floorTileUnder(ev);
        const id = latest.current.selectedId;
        const token = id ? latest.current.tokens.find(t => t.id === id) : null;
        if (!tile || !token || !token.mine || !latest.current.onMove) {
          if (id) latest.current.onSelect?.(null);
          return;
        }
        if (tile.x === token.x && tile.y === token.y) return;
        const piece = w.pieces.get(token.id);
        const others = latest.current.tokens.filter(t => t.id !== token.id);
        const me: Occupant = {
          x: tile.x,
          y: tile.y,
          footprint: token.footprint,
        };
        if (!piece || !canStand(latest.current.terrain, me, others)) return;
        w.hoverMarker.visible = false;
        darkenGhost();
        await settle(token.id, piece, piece.at.clone(), tile);
        relight();
        return;
      }

      const d = w.drag;
      w.drag = null;
      controls.enabled = true;
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // Already released.
      }

      const doc = latest.current.terrain;
      const token = latest.current.tokens.find(t => t.id === d.tokenId);
      const snapBack = () => {
        d.piece.group.position.copy(d.from);
        relight();
      };
      if (!token || !d.hover) return snapBack();
      const to = d.hover;
      if (to.x === token.x && to.y === token.y) return snapBack();

      const me: Occupant = { x: to.x, y: to.y, footprint: token.footprint };
      const others = latest.current.tokens.filter(t => t.id !== d.tokenId);
      if (!canStand(doc, me, others)) return snapBack();

      // Optimistic: set it down where it was dropped, then ask. A refusal
      // snaps it back; an acceptance is confirmed by the next state read.
      darkenGhost();
      await settle(d.tokenId, d.piece, d.from, to);
      relight();
    };
    const onLeave = () => {
      const w = world.current;
      if (w) w.hoverMarker.visible = false;
    };
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMovePointer);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);
    renderer.domElement.addEventListener('pointerleave', onLeave);

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
      if (w.activeRing && !reduce) w.activeRing.rotation.y += dt * 0.7;
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
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      disposeGroup(scene);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      world.current = null;
    };
    // The scene is set up once per mount and per theme. Terrain and tokens are
    // rebuilt by the effects below rather than by tearing all of this down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, reduce]);

  // Terrain: rebuilt whole on change, and the table under it with it, since
  // the table sits at the board's lowest point.
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    if (w.terrainGroup) {
      w.scene.remove(w.terrainGroup);
      disposeGroup(w.terrainGroup);
    }
    if (w.table) {
      w.scene.remove(w.table);
      disposeGroup(w.table);
    }
    const p = readPalette(dark);
    const pictureFor = (imageId: string) =>
      faces.get(imageUrlFor(imageId)) ?? null;
    w.terrainGroup = buildTerrain(terrain, p, dark, pictureFor);
    w.table = buildTable(terrain, dark);
    w.scene.add(w.terrainGroup, w.table);
  }, [terrain, dark, faces, imageUrlFor]);

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
      disposeGroup(piece.group);
    }
    w.moving.clear();
    const p = readPalette(dark);
    const byId = new Map(entries.map(e => [e.id, e]));
    // A token's own picture first, then its character's portrait.
    const faceFor = (entry: EntryRow | undefined, token: BattleTokenRow) => {
      if (token.imageUrl) return faces.get(token.imageUrl) ?? null;
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
      selectedId,
      dark
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
    w.relight?.();
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
      aria-label="The battlefield, in three dimensions. Drag to orbit, scroll to zoom, press T for straight down and F to see the whole board. Tap your token, then tap where it goes — or drag it there."
    />
  );
}
