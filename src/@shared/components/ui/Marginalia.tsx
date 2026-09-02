import { type ReactNode } from 'react';

interface MarginaliaProps {
  children: ReactNode;
  /** Prefix with a leading em dash, as if scrawled after the fact. */
  dash?: boolean;
  className?: string;
}

/**
 * Hand-lettered aside in the margin voice (design rule 5). Personality lives
 * here so headings and body copy can stay straight.
 *
 * Rendered as a plain `<p>` on purpose: the global `h1..h4` rule in
 * `globals.css` applies the display face *and* the dark-mode gold text-shadow,
 * so marginalia must never be a heading. It is also never load-bearing — every
 * line must be removable without losing information.
 */
export function Marginalia({
  children,
  dash = false,
  className,
}: MarginaliaProps) {
  return (
    <p
      className={`font-hand text-[1.1875rem] leading-snug text-ink-subtle ${className ?? ''}`}
    >
      {dash && <span aria-hidden="true">— </span>}
      {children}
    </p>
  );
}
