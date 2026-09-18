import Link from 'next/link';
import { type ReactNode } from 'react';

import { Glyph } from './Glyph';

/**
 * The way back up, above a single-object page: the sheet to the roster, the
 * manage page to its campaign. One drawn chevron (rule 8) and one muted line,
 * so every page that has a parent says so the same way. Plain `next/link`
 * so a server component can use it.
 */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`mb-2 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink ${
        className ?? ''
      }`}
    >
      <Glyph name="back" size={14} className="-ml-0.5" />
      <span>{children}</span>
    </Link>
  );
}
