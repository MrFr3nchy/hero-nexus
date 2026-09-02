import { type ReactNode } from 'react';

import { Marginalia } from './Marginalia';

interface HeroCardProps {
  name: string;
  /** D&D class name — drives the spine colour and the sub-label. */
  charClass?: string;
  level: number;
  species?: string;
  hp?: { current: number; max: number };
  /** Portrait node (e.g. an <img>). Falls back to the name's initials. */
  portrait?: ReactNode;
  /** Optional scrawled aside, rendered in the margin voice. Never load-bearing. */
  note?: ReactNode;
  href?: string;
  className?: string;
}

/** Class → spine colour. Unknown classes fall back to gold. */
const spine: Record<string, string> = {
  barbarian: 'var(--danger)',
  bard: 'var(--arcane)',
  cleric: 'var(--warning)',
  druid: 'var(--success)',
  fighter: 'var(--gold-strong)',
  monk: 'var(--info)',
  paladin: 'var(--gold)',
  ranger: 'var(--success)',
  rogue: 'var(--ink-muted)',
  sorcerer: 'var(--danger)',
  warlock: 'var(--arcane)',
  wizard: 'var(--info)',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function hpColor(current: number, max: number): string {
  if (max <= 0) return 'var(--ink-subtle)';
  const ratio = current / max;
  if (ratio > 0.5) return 'var(--success)';
  if (ratio > 0.25) return 'var(--warning)';
  return 'var(--danger)';
}

/**
 * The party card (design rule 1: the object is the hero). A working fragment of
 * a character, not a description of one. Used on the dashboard, the roster, and
 * campaign pages.
 */
export function HeroCard({
  name,
  charClass,
  level,
  species,
  hp,
  portrait,
  note,
  href,
  className,
}: HeroCardProps) {
  const spineColor = spine[charClass?.toLowerCase() ?? ''] ?? 'var(--gold)';
  const Wrapper = href ? 'a' : 'div';

  return (
    <Wrapper
      {...(href ? { href } : {})}
      className={`relative flex gap-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface py-4 pl-5 pr-4 [box-shadow:var(--shadow-card)] ${
        href ? 'transition-colors hover:border-gold/40' : ''
      } ${className ?? ''}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: spineColor }}
      />

      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-card)] border border-line bg-surface-2 font-display-alt text-lg text-ink-muted"
        aria-hidden={portrait ? undefined : 'true'}
      >
        {portrait ?? initials(name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate font-display text-lg text-ink">{name}</h3>
          <span className="shrink-0 rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-muted">
            Lv {level}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">
          {[charClass, species].filter(Boolean).join(' · ') || '—'}
        </p>

        {hp && (
          <div className="mt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(1, hp.max > 0 ? hp.current / hp.max : 0)) * 100}%`,
                  background: hpColor(hp.current, hp.max),
                }}
              />
            </div>
            <p className="mt-1 text-[0.7rem] tabular-nums text-ink-subtle">
              {hp.current} / {hp.max} HP
            </p>
          </div>
        )}

        {note && (
          <div className="mt-2">
            <Marginalia dash>{note}</Marginalia>
          </div>
        )}
      </div>
    </Wrapper>
  );
}
