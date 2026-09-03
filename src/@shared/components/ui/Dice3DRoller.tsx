'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';

import { motion, useReducedMotion } from '@/@shared/components/motion';
import { rollGroup, type RollResult, type RollSpec } from '@/@shared/lib/dice';

export interface RollRequest {
  /** Bump this to fire a new roll. */
  nonce: number;
  /** The handful of dice one group rolls. */
  spec: RollSpec;
  /** Independent groups to roll at once (6 for a full ability set). */
  groups?: number;
  title?: string;
  /** Short note under the title, e.g. "keep the highest three". */
  hint?: string;
}

interface Dice3DRollerProps {
  request: RollRequest | null;
  onResults: (results: RollResult[], request: RollRequest) => void;
  onClose: () => void;
}

/* ------------------------------------------------------------------ *
 * Timing
 *
 * The old tray ran the whole spin through one cubic-bezier, which front-loads
 * a 1000°+ rotation into the first fifth of the duration: the dice blurred,
 * appeared to stop, then the number arrived. These dice instead tumble at a
 * constant rate while they are in the air, bounce twice on the tray, and only
 * decelerate once they land — the motion you can actually follow.
 * ------------------------------------------------------------------ */

const FLIGHT_MS = 1150;
const REVEAL_MS = 220;
const DIE_STAGGER_MS = 85;
const GROUP_STAGGER_MS = 130;

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

const FACES: { key: string; value: number; transform: string }[] = [
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

const FACE_STYLE =
  'linear-gradient(150deg, color-mix(in srgb, var(--surface) 88%, var(--gold)) 0%, var(--surface) 55%)';

/** Outline for each die size, drawn in a 100x100 box. */
const POLYGON: Record<number, string> = {
  4: '50,6 94,88 6,88',
  8: '50,4 92,50 50,96 8,50',
  10: '50,4 92,38 74,92 26,92 8,38',
  12: '50,3 88,31 73,90 27,90 12,31',
  20: '50,4 92,28 92,72 50,96 8,72 8,28',
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
      className="absolute grid grid-cols-3 grid-rows-3 rounded-[16%] border border-gold/60 p-[13%] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4),inset_0_-6px_10px_rgba(122,92,46,0.12)] [backface-visibility:hidden]"
      style={{
        width: size,
        height: size,
        transform,
        left: 0,
        top: 0,
        background: FACE_STYLE,
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const on = PIP[value]?.some(
          ([r, c]) => r === Math.floor(i / 3) && c === i % 3
        );
        return (
          <span
            key={i}
            className={`m-auto rounded-full ${
              on
                ? 'bg-gold-strong shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)]'
                : ''
            }`}
            style={{ width: '28%', height: '28%' }}
          />
        );
      })}
    </div>
  );
}

/** A polyhedral die drawn flat — used for anything that isn't a d6. */
function PolyDie({
  sides,
  value,
  size,
  settled,
}: {
  sides: number;
  value: number;
  size: number;
  settled: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <polygon
        points={POLYGON[sides] ?? POLYGON[20]}
        className="fill-surface stroke-gold"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <text
        x="50"
        y={sides === 4 ? 72 : 62}
        textAnchor="middle"
        className={settled ? 'fill-gold-strong' : 'fill-ink-subtle'}
        style={{ font: '600 34px var(--font-display, serif)' }}
      >
        {value}
      </text>
    </svg>
  );
}

/**
 * One die: thrown in from above, tumbling at a steady rate, bouncing twice,
 * then settling onto its rolled face. Remounted per roll via a keyed parent,
 * so every throw gets a fresh trajectory.
 */
function Die({
  sides,
  value,
  delay,
  size,
  dropped,
}: {
  sides: number;
  value: number;
  delay: number;
  size: number;
  dropped: boolean;
}) {
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(Boolean(reduce));

  // One trajectory per mount, so six dice never move in lockstep.
  const throwPath = useRef({
    fromX: (Math.random() < 0.5 ? -1 : 1) * (34 + Math.random() * 26),
    spinX: (2 + Math.floor(Math.random() * 2)) * 360,
    spinY: (2 + Math.floor(Math.random() * 3)) * 360,
    tilt: (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 16),
  }).current;

  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(() => setSettled(true), delay + FLIGHT_MS);
    return () => clearTimeout(id);
  }, [delay, reduce]);

  const face = FACE_ROT[value] ?? FACE_ROT[1];
  const isCube = sides === 6;

  // Height above the tray floor, in px, across the bounce.
  const hop = [-118, 0, -30, 0, -8, 0, 0];
  const hopTimes = [0, 0.42, 0.6, 0.78, 0.89, 0.97, 1];
  const hopEase = [
    'easeIn',
    'easeOut',
    'easeIn',
    'easeOut',
    'easeIn',
    'linear',
  ] as const;

  const rotate = isCube
    ? {
        rotateX: [
          face.x - throwPath.spinX,
          face.x - throwPath.spinX * 0.42,
          face.x + 26,
          face.x,
        ],
        rotateY: [
          face.y - throwPath.spinY,
          face.y - throwPath.spinY * 0.42,
          face.y - 18,
          face.y,
        ],
      }
    : {
        rotate: [-throwPath.spinY, -throwPath.spinY * 0.42, throwPath.tilt, 0],
      };

  const content = isCube ? (
    <div
      className="absolute inset-0 [transform-style:preserve-3d]"
      style={{ ['--h' as string]: `${size / 2}px` }}
    >
      {FACES.map(f => (
        <CubeFace
          key={f.key}
          value={f.value}
          transform={f.transform}
          size={size}
        />
      ))}
    </div>
  ) : (
    <PolyDie sides={sides} value={value} size={size} settled={settled} />
  );

  return (
    <div
      className="relative"
      style={{ width: size, height: size + 8, perspective: '760px' }}
    >
      {/* The die's shadow tightens as it drops — the cue that sells the bounce. */}
      {!reduce && (
        <motion.span
          className="absolute bottom-0 left-1/2 -z-10 h-1.5 rounded-[50%] bg-ink/25 blur-[2px]"
          style={{ width: size * 0.8, x: '-50%' }}
          initial={{ scaleX: 0.35, opacity: 0.1 }}
          animate={{
            scaleX: [0.35, 1, 0.6, 1, 0.85, 1, 1],
            opacity: [0.1, 0.34, 0.18, 0.32, 0.24, 0.3, 0.3],
          }}
          transition={{
            duration: FLIGHT_MS / 1000,
            delay: delay / 1000,
            times: hopTimes,
            ease: 'linear',
          }}
        />
      )}

      <motion.div
        className="absolute inset-x-0 top-0 [transform-style:preserve-3d]"
        style={{ height: size, opacity: dropped ? 0.4 : 1 }}
        initial={
          reduce
            ? false
            : {
                x: throwPath.fromX,
                y: hop[0],
                scale: 0.82,
                ...(isCube
                  ? { rotateX: rotate.rotateX![0], rotateY: rotate.rotateY![0] }
                  : { rotate: rotate.rotate![0] }),
              }
        }
        animate={
          reduce
            ? {}
            : {
                x: [throwPath.fromX, throwPath.fromX * 0.3, 0, 0],
                y: hop,
                scale: [0.82, 1.06, 1, 1],
                ...rotate,
              }
        }
        transition={{
          default: {
            duration: FLIGHT_MS / 1000,
            delay: delay / 1000,
            // Linear while airborne, easing out only as the die lands.
            ease: ['linear', 'linear', 'easeOut'] as const,
            times: [0, 0.42, 0.78, 1],
          },
          y: {
            duration: FLIGHT_MS / 1000,
            delay: delay / 1000,
            times: hopTimes,
            ease: [...hopEase],
          },
        }}
      >
        {content}
      </motion.div>

      {dropped && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[150%] -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] bg-danger/70" />
      )}
    </div>
  );
}

function GroupRow({
  result,
  rolling,
  baseDelay,
  size,
}: {
  result: RollResult;
  rolling: boolean;
  baseDelay: number;
  size: number;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-end gap-2">
        {result.dice.map((d, i) => (
          <Die
            key={i}
            sides={result.spec.sides}
            value={d}
            size={size}
            delay={baseDelay + i * DIE_STAGGER_MS}
            dropped={result.droppedIndexes.includes(i)}
          />
        ))}
      </div>
      <span className="font-display text-lg text-ink-subtle">=</span>
      <motion.span
        className="min-w-[2ch] text-center font-display text-2xl tabular-nums text-gold-strong"
        initial={false}
        animate={
          rolling || reduce ? {} : { scale: [1.35, 1], opacity: [0.2, 1] }
        }
        transition={{ duration: REVEAL_MS / 1000, ease: 'easeOut' }}
      >
        {rolling ? '·' : result.total}
      </motion.span>
    </div>
  );
}

/**
 * The dice tray — the one animated moment on a page that needs a roll.
 * Real CSS 3D for d6 (a cube with pips), a drawn polyhedron for every other
 * die size. No WebGL, no assets, and it collapses to a static result under
 * `prefers-reduced-motion`.
 */
export function Dice3DRoller({
  request,
  onResults,
  onClose,
}: Dice3DRollerProps) {
  const [results, setResults] = useState<RollResult[]>([]);
  const [rolling, setRolling] = useState(false);
  const seen = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // With motion off the dice never leave the tray, so waiting out the flight
  // would just be a dead pause before the number appears. Settle immediately.
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!request || request.nonce === seen.current) return;
    seen.current = request.nonce;

    const groups = Math.max(1, request.groups ?? 1);
    const next = Array.from({ length: groups }, () => rollGroup(request.spec));
    setResults(next);
    setRolling(true);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setRolling(false);
        onResults(next, request);
      },
      reduce
        ? 0
        : FLIGHT_MS +
            (groups - 1) * GROUP_STAGGER_MS +
            (request.spec.count - 1) * DIE_STAGGER_MS +
            90
    );
  }, [request, onResults, reduce]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  if (!request) return null;

  const many = (request.groups ?? 1) > 1;

  return (
    <div className="rounded-[var(--radius-card)] border border-gold/40 bg-surface-2 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-display-alt text-xs uppercase tracking-[0.14em] text-ink-muted">
            {request.title ?? 'Rolling'}
          </p>
          {request.hint && (
            <p className="mt-0.5 text-xs text-ink-subtle">{request.hint}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-ink-subtle hover:text-ink"
          aria-label="Close dice tray"
        >
          ✕
        </button>
      </div>

      <div
        key={request.nonce}
        className="flex flex-col items-center gap-4 overflow-hidden rounded-md border border-line bg-gradient-to-b from-surface to-surface-2 px-4 py-6 [box-shadow:inset_0_10px_20px_-14px_rgb(43_38_32/0.4)]"
        role="status"
        aria-live="polite"
      >
        {results.map((r, gi) => (
          <GroupRow
            key={gi}
            result={r}
            rolling={rolling}
            baseDelay={gi * GROUP_STAGGER_MS}
            size={many ? 40 : 56}
          />
        ))}
        <span className="sr-only">
          {rolling ? 'Rolling dice' : results.map(r => `${r.total}`).join(', ')}
        </span>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="flat" isDisabled={rolling} onPress={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
