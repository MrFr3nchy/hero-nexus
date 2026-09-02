'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@heroui/react';

import {
  rollAbilityScore,
  type AbilityRoll,
  type RollMode,
} from '@/@shared/lib/dice';

export interface RollRequest {
  /** bump this to fire a new roll */
  nonce: number;
  /** 1 ability, or a full set of 6 */
  groups: 1 | 6;
  mode: RollMode;
  title?: string;
}

interface Dice3DRollerProps {
  request: RollRequest | null;
  onResults: (rolls: AbilityRoll[], request: RollRequest) => void;
  onClose: () => void;
}

const SETTLE_MS = 1150;

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

function Face({
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
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--surface) 88%, var(--gold)) 0%, var(--surface) 55%)',
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
                : 'bg-transparent'
            }`}
            style={{ width: '28%', height: '28%' }}
          />
        );
      })}
    </div>
  );
}

function Die({
  value,
  delay,
  size = 46,
  dropped = false,
}: {
  value: number;
  delay: number;
  size?: number;
  dropped?: boolean;
}) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Fresh spin per mount; this component is remounted (keyed) on every roll.
  const spin = useRef({
    x:
      (2 + Math.floor(Math.random() * 3)) *
      360 *
      (Math.random() < 0.5 ? 1 : -1),
    y:
      (2 + Math.floor(Math.random() * 3)) *
      360 *
      (Math.random() < 0.5 ? 1 : -1),
  }).current;

  const [settled, setSettled] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setSettled(true))
    );
    return () => cancelAnimationFrame(id);
  }, [reduce]);

  const face = FACE_ROT[value] ?? FACE_ROT[1];
  const transform = settled
    ? `rotateX(${face.x + spin.x}deg) rotateY(${face.y + spin.y}deg)`
    : `rotateX(${face.x - 40}deg) rotateY(${face.y - 40}deg)`;

  return (
    <div
      className="relative"
      style={{
        width: size,
        height: size,
        perspective: '700px',
        opacity: dropped ? 0.4 : 1,
      }}
    >
      <div
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{
          ['--h' as string]: `${size / 2}px`,
          transform,
          transition: reduce
            ? 'none'
            : `transform ${SETTLE_MS}ms cubic-bezier(0.15, 0.7, 0.25, 1) ${delay}ms`,
        }}
      >
        {FACES.map(f => (
          <Face
            key={f.key}
            value={f.value}
            transform={f.transform}
            size={size}
          />
        ))}
      </div>
      {dropped && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[150%] -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] bg-danger/70" />
      )}
    </div>
  );
}

function GroupRow({
  roll,
  rolling,
  baseDelay,
  size,
}: {
  roll: AbilityRoll;
  rolling: boolean;
  baseDelay: number;
  size: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-2">
        {roll.dice.map((d, i) => (
          <Die
            key={i}
            value={d}
            size={size}
            delay={baseDelay + i * 70}
            dropped={roll.droppedIndexes.includes(i)}
          />
        ))}
      </div>
      <span className="font-display text-lg text-ink-subtle">=</span>
      <span className="min-w-[2ch] text-center font-display text-2xl tabular-nums text-gold-strong">
        {rolling ? '…' : roll.total}
      </span>
    </div>
  );
}

/**
 * CSS-3D dice tray. Each die is a real 3D cube (perspective + preserve-3d) that
 * tumbles several turns and settles on its rolled face. No WebGL, no worker, no
 * assets — works everywhere and honours `prefers-reduced-motion`.
 */
export function Dice3DRoller({
  request,
  onResults,
  onClose,
}: Dice3DRollerProps) {
  const [rolls, setRolls] = useState<AbilityRoll[]>([]);
  const [rolling, setRolling] = useState(false);
  const seen = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!request || request.nonce === seen.current) return;
    seen.current = request.nonce;

    const next = Array.from({ length: request.groups }, () =>
      rollAbilityScore(request.mode)
    );
    setRolls(next);
    setRolling(true);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setRolling(false);
        onResults(next, request);
      },
      SETTLE_MS + request.groups * 70 + 120
    );
  }, [request, onResults]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  if (!request) return null;

  const isSet = request.groups === 6;

  return (
    <div className="rounded-[var(--radius-card)] border border-gold/40 bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display-alt text-xs uppercase tracking-[0.14em] text-ink-muted">
          {request.title ?? 'Rolling'} ·{' '}
          {request.mode === '3d6' ? '3d6' : '4d6 keep 3'}
        </span>
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
        className={`flex flex-col items-center gap-4 rounded-md bg-gradient-to-b from-surface to-surface-2 py-6 ${
          isSet ? 'px-3' : 'px-4'
        }`}
      >
        {rolls.map((r, gi) => (
          <GroupRow
            key={gi}
            roll={r}
            rolling={rolling}
            baseDelay={gi * 90}
            size={isSet ? 40 : 58}
          />
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="flat" isDisabled={rolling} onPress={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
