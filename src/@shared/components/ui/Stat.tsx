import { type ReactNode } from 'react';

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Compact borderless variant for dense grids. */
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

/**
 * Character-sheet stat block: a small centred "tab" label on a heavier-bordered
 * tile, so it reads like a printed sheet.
 */
export function StatBlock({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative rounded-[var(--radius-card)] border-2 border-line bg-surface-2 px-3 pb-3 pt-4">
      <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-line bg-surface px-2 py-0.5 font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </span>
      {children}
    </div>
  );
}
