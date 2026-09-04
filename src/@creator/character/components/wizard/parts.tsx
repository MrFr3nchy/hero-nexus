'use client';

import { type ReactNode } from 'react';

/**
 * Shared furniture for the guided builder. Kept deliberately plain: the class
 * and species grids are homogeneous collections, which is the one case the
 * design language allows a grid, so the cards carry the character rather than
 * ornament.
 */

export function StepHeading({
  title,
  lede,
  aside,
}: {
  title: string;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        {lede && (
          <p className="mt-1 max-w-prose text-sm text-ink-muted">{lede}</p>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

export function ChoiceGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

export function ChoiceCard({
  title,
  meta,
  blurb,
  selected,
  custom,
  onSelect,
  footer,
}: {
  title: string;
  meta?: ReactNode;
  blurb?: ReactNode;
  selected: boolean;
  /** Homebrew / "write your own" cards take the arcane accent. */
  custom?: boolean;
  onSelect: () => void;
  footer?: ReactNode;
}) {
  // Tailwind only ships classes it can see, so the accent is picked from
  // whole class strings rather than interpolated.
  const selectedRing = custom
    ? 'border-arcane [box-shadow:0_0_0_1px_var(--arcane),var(--shadow-card)]'
    : 'border-gold [box-shadow:0_0_0_1px_var(--gold),var(--shadow-card)]';
  const idleRing = custom
    ? 'border-arcane/40 hover:border-arcane'
    : 'border-line hover:border-gold/60 hover:[box-shadow:var(--shadow-card)]';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex h-full flex-col rounded-[var(--radius-card)] border bg-surface p-4 text-left transition-all ${
        selected ? selectedRing : idleRing
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg text-ink">{title}</span>
        {selected && (
          <span
            className={`font-display-alt text-[0.6rem] uppercase tracking-[0.16em] ${
              custom ? 'text-arcane' : 'text-gold-strong'
            }`}
          >
            chosen
          </span>
        )}
      </div>
      {meta && (
        <div className="mt-1 font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
          {meta}
        </div>
      )}
      {blurb && <p className="mt-2 text-sm text-ink-muted">{blurb}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </button>
  );
}

/** A small labelled fact, e.g. "Hit die d10". */
export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
      <div className="text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </div>
      <div className="text-sm text-ink">{value}</div>
    </div>
  );
}

export function FactRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** A checkbox-style pill used for skill and option picking. */
export function TogglePill({
  label,
  hint,
  selected,
  disabled,
  locked,
  onToggle,
}: {
  label: ReactNode;
  hint?: ReactNode;
  selected: boolean;
  disabled?: boolean;
  /** Granted by another choice — shown as selected but not clickable. */
  locked?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || locked}
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
        locked
          ? 'cursor-default border-gold/40 bg-gold/10 text-ink'
          : selected
            ? 'border-gold bg-gold/15 text-ink'
            : disabled
              ? 'cursor-not-allowed border-line text-ink-subtle/60'
              : 'border-line bg-surface hover:border-gold/60'
      }`}
    >
      <span>{label}</span>
      {hint && <span className="text-xs text-ink-subtle">{hint}</span>}
    </button>
  );
}

/** Collapsible block of SRD prose — long feature text shouldn't shout. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
      {children}
    </div>
  );
}
