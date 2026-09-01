import { type ReactNode } from 'react';

const widths = {
  narrow: 'max-w-2xl',
  default: 'max-w-4xl',
  wide: 'max-w-6xl',
  full: 'max-w-7xl',
} as const;

interface PageShellProps {
  children: ReactNode;
  width?: keyof typeof widths;
  className?: string;
}

/** Standard page frame: full-height parchment background + centered container. */
export function PageShell({
  children,
  width = 'default',
  className,
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-bg px-4 py-10 sm:px-6 lg:px-8">
      <div className={`mx-auto ${widths[width]} ${className ?? ''}`}>
        {children}
      </div>
    </div>
  );
}
