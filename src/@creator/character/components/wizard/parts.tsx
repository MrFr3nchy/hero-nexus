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

/**
 * Marks an option as somebody's homebrew rather than the SRD.
 *
 * Homebrew is offered inline in the same grid as the SRD — it is a real pick
 * with real mechanics, not a footnote — so the only thing that has to be
 * different is that a player can see where it came from. Same wording and
 * accent as `StatBlock`'s homebrew mark, which is where they will see it next.
 */
export function HomebrewPill() {
  return (
    <span className="rounded-sm border border-arcane/40 bg-arcane/10 px-1.5 py-0.5 font-display-alt text-[0.55rem] uppercase tracking-[0.14em] text-arcane">
      Homebrew
    </span>
  );
}

export function ChoiceCard({
  title,
  meta,
  blurb,
  selected,
  custom,
  homebrew,
  onSelect,
  footer,
}: {
  title: string;
  meta?: ReactNode;
  blurb?: ReactNode;
  selected: boolean;
  /** Homebrew / "write your own" cards take the arcane accent. */
  custom?: boolean;
  /** Somebody's forged content — shows the pill beside the name. */
  homebrew?: boolean;
  onSelect: () => void;
  footer?: ReactNode;
}) {
  // Tailwind only ships classes it can see, so the accent is picked from
  // whole class strings rather than interpolated.
  const accent = custom || homebrew;
  const selectedRing = accent
    ? 'border-arcane [box-shadow:0_0_0_1px_var(--arcane),var(--shadow-card)]'
    : 'border-gold [box-shadow:0_0_0_1px_var(--gold),var(--shadow-card)]';
  const idleRing = accent
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
      {/*
        `min-w-0` and `shrink-0`: a forged name is as long as its author felt
        like, and a two-line one ("Hexblood Warden") used to push the "chosen"
        mark off the card's right edge, where it rendered as "CHOSE". The title
        block is the part that gives way; the state mark never is.
      */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-display text-lg text-ink">{title}</span>
          {homebrew && <HomebrewPill />}
        </span>
        {selected && (
          <span
            className={`shrink-0 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] ${
              accent ? 'text-arcane' : 'text-gold-strong'
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

/**
 * A pick the catalog can no longer offer.
 *
 * Homebrew comes and goes: a DM takes a forged class out of the library, or
 * its author deletes it, and a character built on it reopens with a key that
 * resolves to nothing. The sheet view and the content pickers already render
 * a dangling ref as "unavailable" rather than dropping it, and the wizard owes
 * the player the same — a silently unselected grid reads as a bug, and losing
 * the name would lose the only record of what they had chosen.
 */
export function MissingChoiceCard({
  name,
  kind,
  onClear,
}: {
  name: string;
  /** "class", "species", "background" — used in the explanation. */
  kind: string;
  onClear: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-danger/50 bg-danger/5 p-4">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-lg text-ink">{name}</span>
        <span className="rounded-sm border border-danger/40 px-1.5 py-0.5 font-display-alt text-[0.55rem] uppercase tracking-[0.14em] text-danger">
          Unavailable
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        This {kind} is homebrew that is no longer in play here — the table
        removed it, or its author deleted it. Nothing it granted is filled in.
        Pick another, or keep the name and fill the details in by hand.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 text-sm text-arcane underline underline-offset-2"
      >
        Keep the name, drop the link
      </button>
    </div>
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
