'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AnimatePresence } from 'framer-motion';

import { motion, useReducedMotion } from '@/@shared/components/motion';
import { Marginalia } from '@/@shared/components/ui/Marginalia';
import {
  critToneOf,
  notationSides,
  rollGroup,
  rollNotation,
  type NotationRoll,
  type RollResult,
  type RollSpec,
} from '@/@shared/lib/dice';

import {
  Die,
  DIE_STAGGER_MS,
  FLIGHT_MS,
  GROUP_STAGGER_MS,
  type DieTone,
} from './Die';

/* ------------------------------------------------------------------ *
 * The shape of a cast
 *
 * Deliberately dumber than either roll model in `lib/dice`. The tray takes
 * faces and a total and draws them; it does not care whether the dice were
 * rolled in this browser for an ability score or on the server for the table's
 * log. That is the whole point of hoisting it out of the character creator —
 * one animation, fed from anywhere.
 * ------------------------------------------------------------------ */

export interface DieCast {
  sides: number;
  value: number;
  /** Rolled but not counted — a dropped d6 in `4d6kh3`. */
  dropped?: boolean;
}

export interface CastGroup {
  dice: DieCast[];
  /** Flat bonus folded into the total, shown beside the dice. */
  modifier?: number;
  total: number;
  /** Names this group when several land at once — "Strength", "Level 4". */
  caption?: string;
  tone?: DieTone;
}

export interface CastOptions {
  title?: string;
  /** One short line under the title — "four d6, drop the lowest". */
  hint?: string;
}

export interface DiceTrayApi {
  /** Draw a set of already-decided dice. Resolves when they settle. */
  cast(groups: CastGroup[], options?: CastOptions): Promise<void>;
  /** Roll dice notation here, then draw it. Null when it isn't dice. */
  rollNotation(
    notation: string,
    options?: CastOptions
  ): Promise<NotationRoll | null>;
  /** Draw a roll somebody else made — the table's log rolls on the server. */
  showNotationRoll(roll: NotationRoll, options?: CastOptions): Promise<void>;
  /** Roll N independent handfuls of the same spec — a full ability set. */
  rollSpec(
    spec: RollSpec,
    groups?: number,
    options?: CastOptions
  ): Promise<RollResult[]>;
  dismiss(): void;
}

/* ---- adapters from the two roll models ---------------------------- */

/** One handful from `rollGroup` / `rollAbilityScore`. */
export function groupFromResult(
  result: RollResult,
  caption?: string
): CastGroup {
  return {
    dice: result.dice.map((value, i) => ({
      sides: result.spec.sides,
      value,
      dropped: result.droppedIndexes.includes(i),
    })),
    total: result.total,
    caption,
  };
}

/** One line from `rollNotation`, or from the table's roll log. */
export function groupFromNotation(
  roll: NotationRoll,
  caption?: string
): CastGroup {
  const sides = notationSides(roll.notation) ?? [];
  const tone = critToneOf(roll.notation, roll.dice, roll.dropped);
  return {
    dice: roll.dice.map((value, i) => ({
      sides: sides[i] ?? 20,
      value,
      dropped: roll.dropped.includes(i),
    })),
    modifier: roll.modifier,
    total: roll.total,
    caption,
    tone: tone ?? 'plain',
  };
}

/* ---- timing ------------------------------------------------------- */

/** How long the result stays up once everything has landed. */
const HOLD_MS = 2600;
/** A beat after the last die lands before the total slams in. */
const TOTAL_DELAY_MS = 120;

const TONE_TEXT: Record<DieTone, string> = {
  plain: 'text-gold-strong',
  crit: 'text-success',
  fumble: 'text-danger',
};

const TONE_LINE: Record<DieTone, string | null> = {
  plain: null,
  crit: 'natural 20 — the dice like you',
  fumble: "natural 1 — pretend that didn't happen",
};

function signed(n: number): string {
  return n > 0 ? `+ ${n}` : `− ${Math.abs(n)}`;
}

/** Dice get smaller as the handful grows, so a full set still fits one screen. */
function dieSize(groups: CastGroup[]): number {
  const widest = Math.max(...groups.map(g => g.dice.length));
  if (groups.length > 3 || widest > 6) return 44;
  if (groups.length > 1 || widest > 3) return 58;
  return 78;
}

function GroupRow({
  group,
  baseDelay,
  size,
  settleMs,
}: {
  group: CastGroup;
  baseDelay: number;
  size: number;
  settleMs: number;
}) {
  const reduce = useReducedMotion();
  const [landed, setLanded] = useState(Boolean(reduce));
  const tone = group.tone ?? 'plain';

  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(() => setLanded(true), settleMs);
    return () => clearTimeout(id);
  }, [reduce, settleMs]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      {group.caption && (
        <span className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-ink-subtle">
          {group.caption}
        </span>
      )}
      <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-end justify-center gap-2">
          {group.dice.map((die, i) => (
            <Die
              key={i}
              sides={die.sides}
              value={die.value}
              size={size}
              delay={baseDelay + i * DIE_STAGGER_MS}
              dropped={die.dropped}
              tone={tone}
            />
          ))}
        </div>

        <div className="flex items-baseline gap-2 pb-1">
          {group.modifier !== undefined && group.modifier !== 0 && (
            <span className="font-display text-lg tabular-nums text-ink-muted">
              {signed(group.modifier)}
            </span>
          )}
          <span className="font-display text-lg text-ink-subtle">=</span>
          <motion.span
            className={`min-w-[2ch] text-center font-display text-4xl tabular-nums ${TONE_TEXT[tone]}`}
            initial={reduce ? false : { scale: 1.9, opacity: 0 }}
            animate={landed ? { scale: 1, opacity: 1 } : undefined}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {landed ? group.total : '·'}
          </motion.span>
        </div>
      </div>
    </div>
  );
}

interface ActiveCast {
  id: number;
  groups: CastGroup[];
  options: CastOptions;
}

function TrayOverlay({
  cast,
  onDismiss,
  onSettled,
}: {
  cast: ActiveCast;
  onDismiss: () => void;
  onSettled: () => void;
}) {
  const reduce = useReducedMotion();
  const size = dieSize(cast.groups);

  const settleOf = (index: number) =>
    reduce
      ? 0
      : index * GROUP_STAGGER_MS +
        (cast.groups[index].dice.length - 1) * DIE_STAGGER_MS +
        FLIGHT_MS +
        TOTAL_DELAY_MS;

  const lastSettle = Math.max(...cast.groups.map((_, i) => settleOf(i)));

  const [done, setDone] = useState(false);
  const [held, setHeld] = useState(false);

  // Two clocks: the dice land (which is when the caller may act on the
  // result), then the tray holds the numbers up long enough to read before it
  // clears itself. Pointing at the tray stops the second one.
  useEffect(() => {
    const id = setTimeout(() => {
      setDone(true);
      onSettled();
    }, lastSettle);
    return () => clearTimeout(id);
  }, [lastSettle, onSettled]);

  useEffect(() => {
    if (!done || held) return;
    const id = setTimeout(onDismiss, HOLD_MS);
    return () => clearTimeout(id);
  }, [done, held, onDismiss]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const tone =
    cast.groups.length === 1 ? (cast.groups[0].tone ?? 'plain') : 'plain';
  const line = TONE_LINE[tone];

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
      onClick={onDismiss}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/45 backdrop-blur-[3px]"
      />

      {/* Candlelight behind the tray, brightening as the dice come to rest. */}
      {!reduce && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute h-[46rem] w-[46rem] rounded-full"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--gold) 40%, transparent) 0%, transparent 66%)',
          }}
          initial={{ opacity: 0.1, scale: 0.8 }}
          animate={{ opacity: [0.1, 0.34, 0.2], scale: [0.8, 1.05, 1] }}
          transition={{
            duration: (lastSettle + 500) / 1000,
            times: [0, 0.86, 1],
            ease: 'easeOut',
          }}
        />
      )}

      {/* The hold lives on the panel, not the backdrop: the backdrop fills the
          window, so the pointer is already inside it the instant the tray
          opens and the auto-clear would never fire. */}
      <div
        role="status"
        aria-live="polite"
        onClick={e => e.stopPropagation()}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        className="relative w-full max-w-2xl rounded-[var(--radius-card)] border-2 border-gold/50 bg-surface px-6 pb-6 pt-5 [box-shadow:0_28px_60px_-24px_rgb(0_0_0/0.55)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display-alt text-xs uppercase tracking-[0.16em] text-ink-muted">
              {cast.options.title ?? 'Rolling'}
            </p>
            {cast.options.hint && (
              <p className="mt-0.5 text-xs text-ink-subtle">
                {cast.options.hint}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 shrink-0 rounded-md px-2 py-1 text-sm text-ink-subtle transition-colors hover:text-ink"
          >
            Done
          </button>
        </div>

        {/* The felt. Dice arrive from above it, so nothing here may clip.
            A full ability set is six groups: stacked they run off a laptop
            screen, so past three they pair up into two columns. */}
        <div
          className={`mt-4 grid justify-items-center gap-6 rounded-md border border-line bg-gradient-to-b from-surface-2 to-surface px-4 py-8 [box-shadow:inset_0_12px_24px_-16px_rgb(43_38_32/0.5)] ${
            cast.groups.length > 3 ? 'sm:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {cast.groups.map((group, i) => (
            <GroupRow
              key={i}
              group={group}
              baseDelay={reduce ? 0 : i * GROUP_STAGGER_MS}
              size={size}
              settleMs={settleOf(i)}
            />
          ))}
        </div>

        {line && done && (
          <div className="mt-3 text-center">
            <Marginalia dash>{line}</Marginalia>
          </div>
        )}

        <span className="sr-only">
          {done
            ? cast.groups
                .map(g => `${g.caption ? `${g.caption}: ` : ''}${g.total}`)
                .join(', ')
            : 'Rolling dice'}
        </span>
      </div>
    </motion.div>
  );
}

const DiceTrayContext = createContext<DiceTrayApi | null>(null);

/**
 * The app's dice.
 *
 * Mounted once, at the root, so any surface that rolls something — an ability
 * score, a hit die, a d20 at the table — throws it across the whole window
 * instead of nudging a widget in a box. Callers `await` the cast and act on
 * the result when the dice land, which is the moment the roll means anything.
 */
export function DiceTrayProvider({ children }: { children: ReactNode }) {
  const [cast, setCast] = useState<ActiveCast | null>(null);
  const nextId = useRef(0);
  const settle = useRef<(() => void) | null>(null);

  /** Let a pending `cast()` through exactly once, whenever it ends. */
  const release = useCallback(() => {
    settle.current?.();
    settle.current = null;
  }, []);

  const dismiss = useCallback(() => {
    release();
    setCast(null);
  }, [release]);

  const api = useMemo<DiceTrayApi>(() => {
    const castGroups = (groups: CastGroup[], options: CastOptions = {}) => {
      // A cast already on screen is superseded, not queued: its caller is
      // waiting on dice that no longer matter.
      release();
      if (groups.length === 0) return Promise.resolve();
      nextId.current += 1;
      setCast({ id: nextId.current, groups, options });
      return new Promise<void>(resolve => {
        settle.current = resolve;
      });
    };

    return {
      cast: castGroups,
      dismiss,
      async rollNotation(notation, options) {
        const roll = rollNotation(notation);
        if (!roll) return null;
        await castGroups([groupFromNotation(roll)], {
          title: options?.title ?? roll.notation,
          hint: options?.hint,
        });
        return roll;
      },
      async showNotationRoll(roll, options) {
        await castGroups([groupFromNotation(roll)], {
          title: options?.title ?? roll.notation,
          hint: options?.hint,
        });
      },
      async rollSpec(spec, groups = 1, options) {
        const results = Array.from({ length: Math.max(1, groups) }, () =>
          rollGroup(spec)
        );
        await castGroups(
          results.map(r => groupFromResult(r)),
          options
        );
        return results;
      },
    };
  }, [dismiss, release]);

  const onSettled = useCallback(() => release(), [release]);

  return (
    <DiceTrayContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {cast && (
          <TrayOverlay
            key={cast.id}
            cast={cast}
            onDismiss={dismiss}
            onSettled={onSettled}
          />
        )}
      </AnimatePresence>
    </DiceTrayContext.Provider>
  );
}

export function useDiceTray(): DiceTrayApi {
  const api = useContext(DiceTrayContext);
  if (!api) {
    throw new Error('useDiceTray must be used inside <DiceTrayProvider>');
  }
  return api;
}
