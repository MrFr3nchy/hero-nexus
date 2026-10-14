'use client';

import { Button } from '@heroui/react';

import {
  SUIT_LABEL,
  type Card,
  type Suit,
} from '@/@creator/campaign/lib/crowns';
import { cpWords } from '@/@creator/character/lib/coins';
import { Glyph, type GlyphName } from '@/@shared/components/ui';

/**
 * The small pieces a tavern game is drawn with: a die as it sits in a cup,
 * a playing card, and the row of raises a seat may add.
 */

const PIPS: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [
    [7, 7],
    [17, 17],
  ],
  3: [
    [7, 7],
    [12, 12],
    [17, 17],
  ],
  4: [
    [7, 7],
    [17, 7],
    [7, 17],
    [17, 17],
  ],
  5: [
    [7, 7],
    [17, 7],
    [12, 12],
    [7, 17],
    [17, 17],
  ],
  6: [
    [7, 7],
    [17, 7],
    [7, 12],
    [17, 12],
    [7, 17],
    [17, 17],
  ],
};

/**
 * One die at rest, pips and all. A d6 in a cup is read by its pips, not a
 * number, which is why this is not `DieGlyph`. `tone` says what it counts
 * for: `wild` (a one, while ones are wild), `hit` (it counts toward the bid),
 * `chosen` (picked to palm).
 */
export function PipDie({
  value,
  size = 32,
  tone,
  label,
}: {
  value: number;
  size?: number;
  tone?: 'wild' | 'hit' | 'chosen' | null;
  label?: string;
}) {
  const ring =
    tone === 'chosen'
      ? 'stroke-gold'
      : tone === 'wild' || tone === 'hit'
        ? 'stroke-gold'
        : 'stroke-ink';
  const ground =
    tone === 'hit' || tone === 'chosen' ? 'fill-surface-2' : 'fill-surface';
  const pip =
    tone === 'wild' || tone === 'hit' ? 'fill-gold-strong' : 'fill-ink';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label ?? `a ${value}`}
      className="shrink-0"
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="4"
        strokeWidth={tone === 'chosen' ? 2.2 : 1.2}
        className={`${ring} ${ground}`}
      />
      {(PIPS[value] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" className={pip} />
      ))}
    </svg>
  );
}

/** A face-down die: the cup is on it. */
export function HiddenDie({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="4"
        strokeWidth="1.2"
        strokeDasharray="2 2"
        className="fill-surface-2 stroke-line"
      />
    </svg>
  );
}

const SUIT_GLYPH: Record<Suit, GlyphName> = {
  coins: 'coins',
  cups: 'goblet',
  blades: 'sword',
  staves: 'stave',
};

/** A playing card. A crowned card wears the gold edge and says what it counts. */
export function PlayingCard({
  card,
  crowned,
  multiplier,
  small = false,
}: {
  card: Card;
  crowned: boolean;
  multiplier: number;
  small?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`${card.rank} of ${SUIT_LABEL[card.suit]}${
        crowned ? `, crowned: ${card.rank * multiplier}` : ''
      }`}
      className={`flex shrink-0 flex-col items-center justify-between rounded-md ${
        small ? 'h-[3.6rem] w-10 py-1' : 'h-[5.25rem] w-14 py-1.5'
      } ${
        crowned
          ? 'border-2 border-gold bg-surface-2'
          : 'border border-ink-muted bg-surface'
      }`}
    >
      <span
        className={`font-display font-semibold tabular-nums ${small ? 'text-sm' : 'text-base'}`}
      >
        {card.rank}
      </span>
      <Glyph
        name={SUIT_GLYPH[card.suit]}
        size={small ? 14 : 20}
        className={crowned ? 'text-gold-strong' : 'text-ink-muted'}
      />
      <span
        className={`text-[0.55rem] font-semibold uppercase tracking-[0.06em] ${
          crowned ? 'text-gold-strong' : 'text-ink-subtle'
        }`}
      >
        {crowned ? `×${multiplier}` : SUIT_LABEL[card.suit]}
      </span>
    </div>
  );
}

/** A card still in somebody else's hand. */
export function CardBack({ small = true }: { small?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`shrink-0 rounded-md border border-line bg-surface-2 ${
        small ? 'h-[3.6rem] w-10' : 'h-[5.25rem] w-14'
      }`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent 0 5px, var(--line) 5px 6px)',
      }}
    />
  );
}

/**
 * The raises a seat may add on top of holding: nothing, or a few steps up to
 * the house's cap. Four choices are enough at a table; a typed number is a
 * form, and this is a game.
 */
export function raiseSteps(capCp: number, anteCp: number): number[] {
  if (capCp <= 0) return [0];
  const unit = Math.max(1, anteCp || Math.round(capCp / 5));
  const steps = new Set<number>([0]);
  for (const n of [unit, unit * 2, capCp]) {
    if (n > 0 && n <= capCp) steps.add(n);
  }
  return [...steps].sort((a, b) => a - b);
}

export function RaisePicker({
  steps,
  value,
  onChange,
  affordCp,
}: {
  steps: number[];
  value: number;
  onChange: (cp: number) => void;
  /** What the purse can add on top of holding; Infinity for an NPC. */
  affordCp: number;
}) {
  if (steps.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 text-xs text-ink-muted">Raise</span>
      {steps.map(cp => (
        <Button
          key={cp}
          size="sm"
          variant={value === cp ? 'bordered' : 'light'}
          className={`h-7 min-w-0 px-2 text-xs ${
            value === cp ? 'border-gold text-gold-strong' : 'text-ink-muted'
          }`}
          isDisabled={cp > affordCp}
          onPress={() => onChange(cp)}
        >
          {cp === 0 ? 'No raise' : `+${cpWords(cp)}`}
        </Button>
      ))}
    </div>
  );
}

/**
 * Any die at rest: a d6 by its pips, anything else by its number in a
 * rounded square (a d20 drawn with twenty pips is mud at 32px).
 */
export function DieFace({
  value,
  sides,
  size = 32,
  tone,
}: {
  value: number;
  sides: number;
  size?: number;
  tone?: 'wild' | 'hit' | 'chosen' | null;
}) {
  if (sides === 6) return <PipDie value={value} size={size} tone={tone} />;
  const ring =
    tone === 'chosen' || tone === 'wild' || tone === 'hit'
      ? 'border-gold text-gold-strong'
      : 'border-ink text-ink';
  return (
    <span
      role="img"
      aria-label={`a ${value} on a d${sides}`}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-display font-semibold tabular-nums ${
        tone === 'chosen' ? 'border-2 bg-surface-2' : 'border bg-surface'
      } ${ring}`}
    >
      <span style={{ fontSize: Math.round(size * 0.42) }}>{value}</span>
    </span>
  );
}
