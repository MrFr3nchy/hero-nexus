import { type ReactNode } from 'react';

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Compact borderless variant for dense grids (e.g. the character sheet). */
  plain?: boolean;
}

export function Stat({ label, value, hint, plain }: StatProps) {
  return (
    <div
      className={
        plain
          ? 'text-center'
          : 'rounded-[var(--radius-card)] border border-line bg-surface-2 px-4 py-3 text-center'
      }
    >
      <div className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </div>
      <div className="mt-0.5 font-display text-xl text-ink tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}
