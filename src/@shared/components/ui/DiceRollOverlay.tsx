'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@heroui/react';

import { roll4d6DropLowest, type Roll4d6Result } from '@/@shared/lib/dice';
import { motion, useReducedMotion } from '../motion';

interface DiceRollOverlayProps {
  open: boolean;
  /** 1 = single ability, 6 = a full set to assign */
  count: 1 | 6;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onApply: (results: Roll4d6Result[]) => void;
}

const PIP_LAYOUT: Record<number, [number, number][]> = {
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

function Die({
  value,
  dropped,
  size = 44,
}: {
  value: number;
  dropped?: boolean;
  size?: number;
}) {
  return (
    <div
      className={`relative grid grid-cols-3 grid-rows-3 rounded-[22%] border-2 p-[14%] transition-colors ${
        dropped
          ? 'border-line bg-surface-2 opacity-45'
          : 'border-gold/70 bg-surface shadow-[inset_0_0_0_1px_var(--line)]'
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const on = PIP_LAYOUT[value]?.some(([r, c]) => r === row && c === col);
        return (
          <span
            key={i}
            className={`m-auto h-[6px] w-[6px] rounded-full ${
              on
                ? dropped
                  ? 'bg-ink-subtle'
                  : 'bg-gold-strong'
                : 'bg-transparent'
            }`}
          />
        );
      })}
      {dropped && (
        <span className="pointer-events-none absolute inset-0 m-auto h-[2px] w-[130%] -translate-y-1/2 rotate-[-20deg] self-center bg-danger/70" />
      )}
    </div>
  );
}

function RollRow({
  result,
  rolling,
  faces,
}: {
  result: Roll4d6Result;
  rolling: boolean;
  faces: number[];
}) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      <div className="flex gap-1.5 sm:gap-2">
        {result.rolls.map((v, i) => (
          <motion.div
            key={i}
            animate={
              rolling
                ? { rotate: [0, -12, 12, -8, 0], y: [0, -6, 0, -3, 0] }
                : { rotate: 0, y: 0 }
            }
            transition={
              rolling
                ? { duration: 0.42, repeat: Infinity, ease: 'easeInOut' }
                : { type: 'spring', stiffness: 320, damping: 18 }
            }
          >
            <Die
              value={rolling ? (faces[i] ?? v) : v}
              dropped={!rolling && i === result.dropIndex}
            />
          </motion.div>
        ))}
      </div>
      <span className="font-display text-lg text-ink-subtle">=</span>
      <span className="min-w-[2ch] text-center font-display text-2xl tabular-nums text-gold-strong">
        {rolling ? '—' : result.total}
      </span>
    </div>
  );
}

export function DiceRollOverlay({
  open,
  count,
  title,
  subtitle,
  onClose,
  onApply,
}: DiceRollOverlayProps) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [results, setResults] = useState<Roll4d6Result[]>([]);
  const [rolling, setRolling] = useState(true);
  const [faces, setFaces] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const rolled = Array.from({ length: count }, () => roll4d6DropLowest());
    setResults(rolled);
    setFaces(
      Array.from({ length: count * 4 }, () => 1 + Math.floor(Math.random() * 6))
    );

    if (reduce) {
      setRolling(false);
      return;
    }

    setRolling(true);
    const spin = setInterval(() => {
      setFaces(f => f.map(() => 1 + Math.floor(Math.random() * 6)));
    }, 70);
    const stop = setTimeout(() => {
      clearInterval(spin);
      setRolling(false);
    }, 1050);
    timers.current = [spin];
    return () => {
      clearInterval(spin);
      clearTimeout(stop);
    };
  }, [open, count, reduce]);

  useEffect(() => () => timers.current.forEach(clearInterval), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Rolling dice'}
    >
      <motion.button
        type="button"
        aria-label="Close"
        className="absolute inset-0 h-full w-full cursor-default bg-ink/45 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={rolling ? undefined : onClose}
      />
      <motion.div
        className="relative w-full max-w-md overflow-hidden rounded-[var(--radius-card)] border border-gold/40 bg-surface p-6 text-center [box-shadow:var(--shadow-card)]"
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <span className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full bg-gold/10 blur-2xl" />
        <h3 className="font-display text-xl text-ink">
          {title ?? (count === 1 ? 'Rolling 4d6' : 'Rolling six sets')}
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          {subtitle ?? 'Keep the highest three of four dice.'}
        </p>

        <div className="my-6 space-y-4">
          {results.map((r, i) => (
            <RollRow
              key={i}
              result={r}
              rolling={rolling}
              faces={faces.slice(i * 4, i * 4 + 4)}
            />
          ))}
        </div>

        <div className="flex justify-center gap-3">
          <Button
            variant="bordered"
            className="border-line text-ink"
            isDisabled={rolling}
            onPress={onClose}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            className="px-6"
            isDisabled={rolling}
            onPress={() => {
              onApply(results);
              onClose();
            }}
          >
            {rolling ? 'Rolling…' : count === 1 ? 'Take it' : 'Use these'}
          </Button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
