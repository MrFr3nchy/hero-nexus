'use client';

import { useEffect, useRef, useState } from 'react';

import { motion, useReducedMotion } from '@/@shared/components/motion';

import { shapeFor } from './geometry';

/* ------------------------------------------------------------------ *
 * Timing
 *
 * A die is in the air at a constant rate — a spin run through one
 * cubic-bezier front-loads the rotation, so the die blurs, appears to stop,
 * and only then produces a number. These bounce twice and decelerate on the
 * way down, which is the motion an eye can actually follow.
 * ------------------------------------------------------------------ */

export const FLIGHT_MS = 1150;
export const DIE_STAGGER_MS = 80;
export const GROUP_STAGGER_MS = 120;
/** How long a face is held while the die is still tumbling. */
const SCRAMBLE_MS = 70;

/** Height above the tray floor across the throw, as a fraction of the drop. */
const HOP = [-1, 0, -0.26, 0, -0.07, 0, 0];
const HOP_TIMES = [0, 0.42, 0.6, 0.78, 0.89, 0.97, 1];
const HOP_EASE = [
  'easeIn',
  'easeOut',
  'easeIn',
  'easeOut',
  'easeIn',
  'linear',
] as const;

/** Face value -> the cube rotation (deg) that brings that face to the front. */
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  6: { x: 0, y: 180 },
};

const PIP: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

const CUBE_FACES: { key: string; value: number; transform: string }[] = [
  { key: 'front', value: 1, transform: 'translateZ(var(--h))' },
  { key: 'back', value: 6, transform: 'rotateY(180deg) translateZ(var(--h))' },
  { key: 'right', value: 3, transform: 'rotateY(90deg) translateZ(var(--h))' },
  { key: 'left', value: 4, transform: 'rotateY(-90deg) translateZ(var(--h))' },
  { key: 'top', value: 5, transform: 'rotateX(90deg) translateZ(var(--h))' },
  {
    key: 'bottom',
    value: 2,
    transform: 'rotateX(-90deg) translateZ(var(--h))',
  },
];

const CUBE_FACE_FILL =
  'linear-gradient(150deg, color-mix(in srgb, var(--surface) 84%, var(--gold)) 0%, var(--surface) 58%)';

/** The body colour every die shares, so a mixed handful reads as one set. */
const BODY_FILL = 'color-mix(in srgb, var(--surface) 85%, var(--gold))';

export type DieTone = 'plain' | 'crit' | 'fumble';

const TONE_RIM: Record<DieTone, string> = {
  plain: 'var(--gold)',
  crit: 'var(--success)',
  fumble: 'var(--danger)',
};

function CubeFace({
  value,
  transform,
  size,
}: {
  value: number;
  transform: string;
  size: number;
}) {
  return (
    <div
      className="absolute left-0 top-0 grid grid-cols-3 grid-rows-3 rounded-[16%] border border-gold/60 p-[13%] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35),inset_0_-6px_10px_rgba(122,92,46,0.14)] [backface-visibility:hidden]"
      style={{
        width: size,
        height: size,
        transform,
        background: CUBE_FACE_FILL,
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const on = PIP[value]?.some(
          ([r, c]) => r === Math.floor(i / 3) && c === i % 3
        );
        return (
          <span
            key={i}
            className={
              on
                ? 'm-auto rounded-full bg-gold-strong shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)]'
                : 'm-auto rounded-full'
            }
            style={{ width: '28%', height: '28%' }}
          />
        );
      })}
    </div>
  );
}

/**
 * A polyhedron at rest: body, facets shaded away from the light, a rim, and
 * the face value sitting in the lit facet.
 *
 * Exported because a still die is worth having on its own — a d20 waiting to
 * be clicked is the same object as the one that just landed, and drawing it
 * twice would let the two drift apart.
 */
export function DieGlyph({
  sides,
  value,
  size,
  settled = true,
  tone = 'plain',
}: {
  sides: number;
  value: number;
  size: number;
  /** Dim the number while the die is still deciding. */
  settled?: boolean;
  tone?: DieTone;
}) {
  const shape = shapeFor(sides);
  const rim = TONE_RIM[tone];
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: size, height: size, overflow: 'visible' }}
      aria-hidden="true"
    >
      <polygon points={shape.silhouette} fill={BODY_FILL} />
      {shape.facets.map(facet => (
        <polygon
          key={facet.points}
          points={facet.points}
          fill="#000"
          opacity={facet.shade * 0.19}
        />
      ))}
      {/* Shadow alone is nearly invisible on the candlelight palette's dark
          body, so the facets turned toward the light also catch a sheen. It
          costs nothing on parchment, where white on near-white does not show. */}
      {shape.facets.map(facet => (
        <polygon
          key={`lit-${facet.points}`}
          points={facet.points}
          fill="#fff"
          opacity={(1 - facet.shade) * 0.07}
        />
      ))}
      {shape.facets.map(facet => (
        <polygon
          key={`edge-${facet.points}`}
          points={facet.points}
          fill="none"
          stroke={rim}
          strokeWidth="0.9"
          strokeLinejoin="round"
          opacity="0.4"
        />
      ))}
      <polygon
        points={shape.silhouette}
        fill="none"
        stroke={rim}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <text
        x={shape.label.x}
        y={shape.label.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={
          settled
            ? tone === 'plain'
              ? 'var(--gold-strong)'
              : rim
            : 'var(--ink-subtle)'
        }
        style={{
          font: `600 ${shape.label.size}px var(--font-display, serif)`,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </text>
      {shape.suffix && (
        <text
          x={shape.suffix.x}
          y={shape.suffix.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--ink-subtle)"
          style={{
            font: `600 ${shape.suffix.size}px var(--font-display, serif)`,
          }}
        >
          {shape.suffix.text}
        </text>
      )}
    </svg>
  );
}

export interface DieProps {
  sides: number;
  /** The face it lands on. */
  value: number;
  size: number;
  /** Milliseconds after the throw starts before this die leaves the hand. */
  delay: number;
  /** Rolled but not counted — kept visible, struck through, and dimmed. */
  dropped?: boolean;
  tone?: DieTone;
}

/**
 * One die: thrown in from above the tray, tumbling at a steady rate with its
 * face cycling, bouncing twice, then settling on the value it rolled and
 * throwing a ring of light out across the tray floor.
 *
 * Every throw wants a fresh trajectory, so the tray keys its dice on the cast
 * — a die is a new component each time, and its arc is chosen at mount.
 */
export function Die({
  sides,
  value,
  size,
  delay,
  dropped = false,
  tone = 'plain',
}: DieProps) {
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(Boolean(reduce));
  const [face, setFace] = useState(reduce ? value : 1);

  const path = useRef({
    fromX: (Math.random() < 0.5 ? -1 : 1) * (36 + Math.random() * 30),
    drop: 150 + Math.random() * 60,
    spinX: (2 + Math.floor(Math.random() * 2)) * 360,
    spinY: (2 + Math.floor(Math.random() * 3)) * 360,
    tilt: (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 16),
  }).current;

  // While the die is in the air its face is anybody's guess. Cycling it is
  // what makes a roll unmistakably a roll rather than a number fading in.
  useEffect(() => {
    if (reduce) return;
    const scramble = setInterval(
      () => setFace(1 + Math.floor(Math.random() * sides)),
      SCRAMBLE_MS
    );
    const land = setTimeout(() => {
      clearInterval(scramble);
      setFace(value);
      setSettled(true);
    }, delay + FLIGHT_MS);
    return () => {
      clearInterval(scramble);
      clearTimeout(land);
    };
  }, [delay, reduce, sides, value]);

  const isCube = sides === 6;
  const target = FACE_ROT[value] ?? FACE_ROT[1];

  const rotate = isCube
    ? {
        rotateX: [
          target.x - path.spinX,
          target.x - path.spinX * 0.42,
          target.x + 26,
          target.x,
        ],
        rotateY: [
          target.y - path.spinY,
          target.y - path.spinY * 0.42,
          target.y - 18,
          target.y,
        ],
      }
    : { rotate: [-path.spinY, -path.spinY * 0.42, path.tilt, 0] };

  const body = isCube ? (
    <div
      className="absolute inset-0 [transform-style:preserve-3d]"
      style={{ ['--h' as string]: `${size / 2}px` }}
    >
      {CUBE_FACES.map(f => (
        <CubeFace
          key={f.key}
          value={f.value}
          transform={f.transform}
          size={size}
        />
      ))}
    </div>
  ) : (
    <DieGlyph
      sides={sides}
      value={face}
      size={size}
      settled={settled}
      tone={tone}
    />
  );

  return (
    <div
      className="relative"
      style={{ width: size, height: size + 10, perspective: '820px' }}
    >
      {/* The shadow tightens as the die drops — the cue that sells the bounce. */}
      {!reduce && (
        <motion.span
          className="absolute bottom-0 left-1/2 -z-10 h-1.5 rounded-[50%] bg-ink/30 blur-[2px]"
          style={{ width: size * 0.82, x: '-50%' }}
          initial={{ scaleX: 0.3, opacity: 0.08 }}
          animate={{
            scaleX: [0.3, 1, 0.58, 1, 0.84, 1, 1],
            opacity: [0.08, 0.36, 0.18, 0.34, 0.24, 0.32, 0.32],
          }}
          transition={{
            duration: FLIGHT_MS / 1000,
            delay: delay / 1000,
            times: HOP_TIMES,
            ease: 'linear',
          }}
        />
      )}

      {/* Landing ring: the die hits the felt and light goes out across it. */}
      {!reduce && (
        <motion.span
          className="pointer-events-none absolute bottom-0 left-1/2 -z-10 rounded-full border-2"
          style={{
            width: size,
            height: size * 0.4,
            x: '-50%',
            y: '30%',
            borderColor: TONE_RIM[tone],
          }}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 2.1], opacity: [0.6, 0] }}
          transition={{
            duration: 0.55,
            delay: (delay + FLIGHT_MS) / 1000,
            ease: 'easeOut',
          }}
        />
      )}

      <motion.div
        className="absolute inset-x-0 top-0 [transform-style:preserve-3d]"
        style={{ height: size, opacity: dropped ? 0.42 : 1 }}
        initial={
          reduce
            ? false
            : {
                x: path.fromX,
                y: HOP[0] * path.drop,
                scale: 0.8,
                ...(isCube
                  ? { rotateX: rotate.rotateX![0], rotateY: rotate.rotateY![0] }
                  : { rotate: rotate.rotate![0] }),
              }
        }
        animate={
          reduce
            ? {}
            : {
                x: [path.fromX, path.fromX * 0.3, 0, 0],
                y: HOP.map(h => h * path.drop),
                scale: [0.8, 1.08, 1, 1],
                ...rotate,
              }
        }
        transition={{
          default: {
            duration: FLIGHT_MS / 1000,
            delay: delay / 1000,
            // Linear while airborne; the ease belongs on the landing alone.
            ease: ['linear', 'linear', 'easeOut'] as const,
            times: [0, 0.42, 0.78, 1],
          },
          y: {
            duration: FLIGHT_MS / 1000,
            delay: delay / 1000,
            times: HOP_TIMES,
            ease: [...HOP_EASE],
          },
        }}
      >
        {body}
      </motion.div>

      {dropped && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[150%] -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] bg-danger/70" />
      )}
    </div>
  );
}
