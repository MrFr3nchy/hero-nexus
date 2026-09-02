import { type ReactNode } from 'react';

import { StatBlock } from './Stat';

type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

const ABILITY_ORDER: { key: AbilityKey; label: string }[] = [
  { key: 'str', label: 'Str' },
  { key: 'dex', label: 'Dex' },
  { key: 'con', label: 'Con' },
  { key: 'int', label: 'Int' },
  { key: 'wis', label: 'Wis' },
  { key: 'cha', label: 'Cha' },
];

interface SheetPreviewProps {
  name: string;
  /** e.g. "Level 3 · Half-Elf Bard". */
  meta?: ReactNode;
  abilities: Record<AbilityKey, number>;
  /** Derived rows — AC, Initiative, Proficiency, Save DC, … */
  derived?: { label: string; value: ReactNode }[];
  className?: string;
}

export function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * A read-only character sheet card (design rule 1). Driven by a plain object so
 * the marketing page can feed it fixture data without touching the real
 * character model.
 */
export function SheetPreview({
  name,
  meta,
  abilities,
  derived,
  className,
}: SheetPreviewProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border-2 border-line bg-surface p-5 [box-shadow:var(--shadow-card)] ${className ?? ''}`}
    >
      <div className="border-b border-line pb-3">
        <h3 className="font-display text-xl text-ink">{name}</h3>
        {meta && <p className="mt-0.5 text-sm text-ink-muted">{meta}</p>}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {ABILITY_ORDER.map(({ key, label }) => (
          <StatBlock key={key} label={label}>
            <div className="text-center">
              <div className="font-display text-xl text-ink tabular-nums">
                {abilities[key]}
              </div>
              <div className="text-xs tabular-nums text-ink-muted">
                {abilityMod(abilities[key])}
              </div>
            </div>
          </StatBlock>
        ))}
      </div>

      {derived && derived.length > 0 && (
        <dl className="mt-4 divide-y divide-line border-t border-line">
          {derived.map(row => (
            <div
              key={row.label}
              className="flex items-center justify-between py-2 text-sm"
            >
              <dt className="text-ink-muted">{row.label}</dt>
              <dd className="font-display text-ink tabular-nums">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
