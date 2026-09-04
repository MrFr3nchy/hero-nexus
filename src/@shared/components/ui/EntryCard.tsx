'use client';

import { type ReactNode, useState } from 'react';

/**
 * One thing in a collection — a canon NPC, an item, a downtime action.
 *
 * The shape is deliberately the same everywhere: a picture if there is one, a
 * kind badge, a title, a line of small facts, then a body that stays folded
 * until asked for. A shelf of these reads as a shelf, which is the whole point
 * of a compendium; a page of open prose does not.
 */
export function EntryCard({
  title,
  kind,
  imageUrl,
  imageAlt,
  meta,
  badges,
  summary,
  children,
  actions,
  tone = 'default',
  defaultOpen = false,
}: {
  title: ReactNode;
  /** Small uppercase label — "NPC", "Spell", "Crafting". */
  kind?: ReactNode;
  imageUrl?: string | null;
  imageAlt?: string;
  /** A line of small facts under the title. */
  meta?: ReactNode;
  /** Chips to the right of the title — visibility, status, who it reached. */
  badges?: ReactNode;
  /** Always-visible first line of the body. */
  summary?: ReactNode;
  /** The folded body. Omit it and the card stays a header. */
  children?: ReactNode;
  actions?: ReactNode;
  tone?: 'default' | 'arcane' | 'gold' | 'muted';
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Whole class strings: Tailwind only ships what it can see.
  const edge = {
    default: 'border-line',
    arcane: 'border-arcane/45',
    gold: 'border-gold/45',
    muted: 'border-line opacity-80',
  }[tone];

  return (
    <div
      className={`flex gap-3 rounded-[var(--radius-card)] border bg-surface p-3 ${edge}`}
    >
      {imageUrl && (
        // Deliberately an <img>: the file is served through a role-checked
        // route, which next/image's optimiser cannot fetch on the server.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={imageAlt ?? ''}
          className="h-20 w-20 shrink-0 rounded-md border border-line object-cover"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            {kind && (
              <div className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                {kind}
              </div>
            )}
            <h3 className="truncate font-display text-base text-ink">
              {title}
            </h3>
          </div>
          {badges && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {badges}
            </div>
          )}
        </div>

        {meta && <div className="mt-0.5 text-xs text-ink-subtle">{meta}</div>}
        {summary && !open && (
          <div className="mt-1.5 text-sm text-ink-muted">{summary}</div>
        )}

        {children && (
          <>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              className="mt-2 text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {open ? 'Close' : 'Read'}
            </button>
            {open && <div className="mt-2">{children}</div>}
          </>
        )}

        {actions && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/** A small state chip: visibility, status, anything one word wide. */
export function Pill({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'arcane' | 'gold' | 'warning' | 'success';
}) {
  const skin = {
    default: 'border-line text-ink-subtle',
    arcane: 'border-arcane/40 text-arcane',
    gold: 'border-gold/50 text-gold-strong',
    warning: 'border-warning/40 text-warning',
    success: 'border-success/40 text-success',
  }[tone];

  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] ${skin}`}
    >
      {children}
    </span>
  );
}
