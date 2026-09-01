import { type ReactNode } from 'react';

type Tone = 'gold' | 'neutral' | 'success' | 'warning' | 'danger' | 'arcane';

const tone: Record<Tone, string> = {
  gold: 'bg-gold/12 text-gold-strong dark:text-gold',
  neutral: 'bg-surface-2 text-ink-muted',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  arcane: 'bg-arcane/12 text-arcane',
};

/** A little heraldic banner badge — notched ends via clip-path. */
export function Ribbon({
  children,
  tone: t = 'gold',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-block px-3 py-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] ${tone[t]} ${className ?? ''}`}
      style={{
        clipPath:
          'polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%)',
      }}
    >
      {children}
    </span>
  );
}
