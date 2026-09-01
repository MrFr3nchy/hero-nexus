'use client';

import { type ReactNode } from 'react';

import { Reveal } from '../motion';
import { Fleuron } from './Fleuron';

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
        <Reveal>
          {eyebrow && (
            <p className="mb-1.5 font-display-alt text-[0.7rem] uppercase tracking-[0.2em] text-gold">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display-alt text-2xl text-ink sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-ink-muted">{description}</p>
          )}
        </Reveal>
        {actions && (
          <Reveal delay={0.06} className="flex shrink-0 flex-wrap gap-2">
            {actions}
          </Reveal>
        )}
      </div>
      <div className="mt-5">
        <Fleuron />
      </div>
    </header>
  );
}
