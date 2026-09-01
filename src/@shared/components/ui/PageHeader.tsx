import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small kicker line above the title (e.g. section name). */
  eyebrow?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <header className={`mb-8 ${className ?? ''}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && (
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-gold">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl text-ink sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-ink-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      <div className="mt-5 h-px w-full bg-gradient-to-r from-gold/60 via-line to-transparent" />
    </header>
  );
}
